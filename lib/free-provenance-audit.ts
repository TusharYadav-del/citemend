import "server-only";
import { isIP } from "node:net";
import { load } from "cheerio";
import { analyzeExtractabilityPage, type ExtractabilityBot } from "./extractability-audit";
import { lookupWaybackSnapshot, type WaybackSnapshot } from "./link-health";
import { assertPublicUrl, publicFetch } from "./public-http";

const BOTS: ExtractabilityBot[] = ["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended"];

export function normalizeFreeAuditUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new TypeError("Enter a public page URL.");
  let url: URL;
  try { url = assertPublicUrl(value.includes("://") ? value.trim() : `https://${value.trim()}`); }
  catch { throw new TypeError("Enter a public HTTP or HTTPS page URL."); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || isIP(host) || /\.(?:local|internal|localhost)$/.test(host)) throw new TypeError("Enter a public DNS hostname.");
  url.hash = "";
  return url.href;
}

async function boundedText(response: Response, limit: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

type Fetcher = (value: string | URL, init: RequestInit) => Promise<Response>;

async function fetchRobots(origin: string, fetcher: Fetcher): Promise<string | null> {
  try {
    const response = await fetcher(new URL("/robots.txt", origin), { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (response.status === 404) { await response.body?.cancel(); return ""; }
    if (response.status !== 200) { await response.body?.cancel(); return null; }
    return boundedText(response, 256_000);
  } catch { return null; }
}

export function analyzeFreeAuditMetadata(html: string, pageUrl: string) {
  const $ = load(html);
  const title = $("head title").first().text().trim();
  const description = $("head meta[name='description']").attr("content")?.trim() ?? "";
  const rawCanonical = $("head link[rel='canonical']").attr("href");
  let canonical: string | null = null;
  if (rawCanonical) {
    try {
      const parsed = new URL(rawCanonical, pageUrl);
      if (["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password) canonical = parsed.href;
    } catch { /* Invalid canonical is reported below. */ }
  }
  const jsonLdBlocks = $("script[type='application/ld+json']").map((_, element) => $(element).text()).get();
  const jsonLdValidCount = jsonLdBlocks.filter(value => { try { const parsed: unknown = JSON.parse(value); return !!parsed && typeof parsed === "object"; } catch { return false; } }).length;
  return { titlePresent: title.length > 0, descriptionPresent: description.length > 0, canonicalPresent: !!canonical, canonical, canonicalMatchesHost: canonical ? new URL(canonical).hostname === new URL(pageUrl).hostname : null, jsonLdBlockCount: jsonLdBlocks.length, jsonLdValidCount };
}

export type FreeProvenanceReport = Awaited<ReturnType<typeof runFreeProvenanceAudit>>;

/** One page and one robots file; no model calls or crawling of linked pages. */
export async function runFreeProvenanceAudit(input: string, dependencies: { fetcher?: Fetcher; wayback?: (url: string) => Promise<WaybackSnapshot | null> } = {}) {
  const url = normalizeFreeAuditUrl(input);
  const origin = new URL(url).origin;
  const fetcher = dependencies.fetcher ?? publicFetch;
  const [pageResult, robotsText] = await Promise.all([
    fetcher(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(8000), headers: { Accept: "text/html" } }).catch(() => null),
    fetchRobots(origin, fetcher),
  ]);
  const status = pageResult?.status ?? null;
  const contentType = pageResult?.headers.get("content-type") ?? "";
  const html = pageResult?.status === 200 && /text\/html/i.test(contentType) ? await boundedText(pageResult, 1_000_000) : null;
  if (html === null) await pageResult?.body?.cancel().catch(() => undefined);
  const metrics = analyzeExtractabilityPage({ url, html: html ?? "", status, robotsText });
  const metadata = html === null ? null : analyzeFreeAuditMetadata(html, url);
  const snapshot = status === 404 || status === 410 ? await (dependencies.wayback ?? lookupWaybackSnapshot)(url) : null;
  return {
    url, domain: new URL(url).hostname.toLowerCase(), httpStatus: status,
    linkState: status === 404 || status === 410 ? "permanent_dead" as const : status === null || status === 408 || status === 425 || status === 429 || status >= 500 ? "unavailable" as const : status === 200 ? "live" as const : "other_status" as const,
    waybackSnapshot: snapshot,
    crawlerAccess: Object.fromEntries(BOTS.map(bot => [bot, metrics.robots[bot]])) as Record<ExtractabilityBot, boolean | null>,
    navigationLinkCount: html === null ? null : metrics.navigationLinkCount,
    navigationBloat: html === null ? null : metrics.navigationLinkCount >= 60,
    serverRendered: html === null ? null : metrics.serverRendered,
    metadata,
    limits: "This checks one public page and its robots.txt. A missing archive snapshot means none was returned by the availability API. User-agent access is a robots rule check, not proof that an AI engine retrieved or cited this page.",
  };
}
