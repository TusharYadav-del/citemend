import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { readRequestJson } from "./read-request-json";
import { assertPublicUrl } from "./public-http";
import { fetchCorePage, fetchCitedPage, checkRobotsAllows } from "./entity-consistency";
import { fetchSitemapUrls, tracePublicRedirects, verifyUrl } from "./seo";
import { extractTextUrls } from "./citation-urls";
import { measureBuyerPromptCoverage } from "./citation-forensics";
import { runCitationProbe } from "./citation-probe";

export type TeaserFinding = {
  kind: "discoverability" | "retrieval" | "citation_selection" | "stale_content" | "broken_destination";
  observableEvidence: string[];
  diagnosticHypotheses: string[];
};
export type ForensicTeaserReport = {
  domain: string;
  status: "complete" | "partial";
  runMode: "groq_tavily_modeled_answer" | "page_only";
  diagnosticSummary: string;
  citationSummary: { modeledAnswerAvailable: boolean; ownDomainUrlMentions: number | null; verifiedBrokenUrls: number | null; missingCitationCount: number | null; brokenOrMissingCount: number | null };
  pageEvidence: { httpStatus: number | null; sitemapCheckAvailable: boolean; homepageInSitemap: boolean | null; robotsAllows: boolean | null; structuredDataBlocks: number; lastModified: string | null; lexicalPromptCoverage: number | null };
  findings: TeaserFinding[];
  limits: string[];
};

export function normalizeTeaserDomain(value: unknown): string {
  if (typeof value !== "string" || value.trim().length > 260) throw new TypeError("Enter a public domain such as example.com.");
  const raw = value.trim();
  let parsed: URL;
  try { parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); }
  catch { throw new TypeError("Enter a valid public domain such as example.com."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new TypeError("Enter only a public domain, without a path, credentials, or custom port.");
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!hostname.includes(".") || hostname.length > 253 || isIP(hostname)) throw new TypeError("Enter a public DNS hostname, not an IP address or local host.");
  assertPublicUrl(`https://${hostname}`);
  return hostname;
}

export function teaserRateLimitKey(request: Request, purpose: "scan" | "application"): string {
  const secret = process.env.CITEMEND_PUBLIC_RATE_LIMIT_SECRET?.trim()
    || process.env.CRON_SECRET?.trim()
    || process.env.CLERK_SECRET_KEY?.trim()
    || process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("A server-only rate-limit signing secret is required.");
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  const address = (request.headers.get("x-real-ip")?.trim() || forwarded?.at(-1) || "unknown").slice(0, 128);
  return createHmac("sha256", secret).update(`citemend-public:${purpose}:${address}`).digest("hex");
}

type ScanBody = { domain: string; buyerPrompt: string };
function parseScanBody(value: unknown): ScanBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Send a domain and one buyer prompt.");
  const row = value as Record<string, unknown>;
  if (typeof row.buyerPrompt !== "string" || row.buyerPrompt.trim().length < 8 || row.buyerPrompt.length > 4000) throw new TypeError("Enter one buyer prompt between 8 and 4000 characters.");
  return { domain: normalizeTeaserDomain(row.domain), buyerPrompt: row.buyerPrompt.trim() };
}

type ForensicTeaserDependencies = {
  consumeRateLimit: (request: Request) => Promise<boolean>;
  run: (domain: string, buyerPrompt: string) => Promise<ForensicTeaserReport>;
};

export function createForensicTeaserHandler(dependencies: ForensicTeaserDependencies) {
  return async function handle(request: Request): Promise<Response> {
    const parsed = await readRequestJson(request, 8192);
    if (parsed.kind === "too_large") return Response.json({ error: "Request body exceeds 8 KiB." }, { status: 413, headers: { "Cache-Control": "no-store" } });
    if (parsed.kind !== "ok") return Response.json({ error: "Send valid JSON containing a domain and buyer prompt." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    let input: ScanBody;
    try { input = parseScanBody(parsed.value); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid scan input." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
    try {
      if (!await dependencies.consumeRateLimit(request)) return Response.json({ error: "Free scans are limited to five per minute. Please try again shortly." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
    } catch { return Response.json({ error: "The scan limiter is temporarily unavailable. Please try again later." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
    try {
      const report = await dependencies.run(input.domain, input.buyerPrompt);
      return Response.json(report, { headers: { "Cache-Control": "no-store" } });
    } catch { return Response.json({ error: "The forensic scan could not be completed. Check the domain and retry later." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  };
}

function belongsToDomain(value: string, domain: string): boolean {
  try { const host = new URL(value).hostname.toLowerCase(); return host === domain || host.endsWith(`.${domain}`); }
  catch { return false; }
}

export async function runPublicForensicTeaser(domain: string, buyerPrompt: string): Promise<ForensicTeaserReport> {
  const origin = assertPublicUrl(`https://${normalizeTeaserDomain(domain)}`);
  const homeUrl = new URL("/", origin).href;
  const [traceResult, sitemapResult, robotsResult, pageResult, probeResult] = await Promise.allSettled([
    tracePublicRedirects(homeUrl), fetchSitemapUrls(origin.hostname), checkRobotsAllows(homeUrl),
    fetchCorePage(origin.hostname, "homepage"), runCitationProbe(origin.hostname, buyerPrompt),
  ]);
  const targetStatus = traceResult.status === "fulfilled" ? traceResult.value.status : null;
  const sitemapAvailable = sitemapResult.status === "fulfilled";
  const sitemapUrls = sitemapAvailable ? sitemapResult.value : [];
  const homeInSitemap = sitemapAvailable ? sitemapUrls.some((url) => { try { const parsed = new URL(url); return parsed.hostname === origin.hostname && parsed.pathname === "/"; } catch { return false; } }) : null;
  const robotsAllows = robotsResult.status === "fulfilled" ? robotsResult.value : null;
  const page = pageResult.status === "fulfilled" ? pageResult.value : null;
  const probe = probeResult.status === "fulfilled" ? probeResult.value : null;
  const promptCoverage = page ? measureBuyerPromptCoverage(buyerPrompt, page.title, page.featureClaims) : null;
  const ownDomainUrls = probe ? extractTextUrls(probe.text).filter((url) => belongsToDomain(url, origin.hostname)).slice(0, 8) : [];
  const checkedOwnUrls = await Promise.all(ownDomainUrls.map((url) => verifyUrl(url)));
  const brokenCount = probe ? checkedOwnUrls.filter((result) => result.state === "404" || result.state === "410").length : null;
  const missingCount = probe && ownDomainUrls.length === 0 ? 1 : probe ? 0 : null;
  const brokenOrMissingCount = brokenCount === null || missingCount === null ? null : brokenCount + missingCount;
  const thirdPartySources = probe?.searchGrounding.sources.filter((source) => !belongsToDomain(source.url, origin.hostname)).slice(0, 2) ?? [];
  const checkedThirdPartyPages = await Promise.all(thirdPartySources.map((source) => fetchCitedPage(source.url)));
  const thirdPartySchemaCount = Math.max(0, ...checkedThirdPartyPages.map((source) => source.jsonLd.length));
  const findings: TeaserFinding[] = [];

  if (homeInSitemap === false || robotsAllows === false) findings.push({
    kind: "discoverability",
    observableEvidence: [homeInSitemap === false ? "The homepage was not found in the successfully fetched sitemap." : "The site's robots.txt disallows the homepage."],
    diagnosticHypotheses: ["Reduced crawl discovery may limit opportunities for pages on this domain to appear in search-grounded answers."],
  });
  if (promptCoverage !== null && promptCoverage < 0.35 || probe && ownDomainUrls.length === 0) findings.push({
    kind: "retrieval",
    observableEvidence: [probe && ownDomainUrls.length === 0 ? "This single modeled answer returned no URL on the submitted domain." : `Deterministic word overlap between the prompt and homepage text was ${Math.round((promptCoverage ?? 0) * 100)}%.`],
    diagnosticHypotheses: ["The homepage may not clearly match this buyer prompt. Word overlap and one modeled answer are limited signals, not a model-retrieval measurement."],
  });
  if (thirdPartySchemaCount > (page?.jsonLd.length ?? 0)) findings.push({
    kind: "citation_selection",
    observableEvidence: [`A checked third-party search result contains ${thirdPartySchemaCount} JSON-LD block(s); the homepage contains ${page?.jsonLd.length ?? 0}.`],
    diagnosticHypotheses: ["The third-party page has more structured data in this comparison; this does not establish why any AI system selected it."],
  });
  const staleDays = page?.updatedAt ? (Date.now() - Date.parse(page.updatedAt)) / 86_400_000 : null;
  if (staleDays !== null && Number.isFinite(staleDays) && staleDays > 180) findings.push({
    kind: "stale_content",
    observableEvidence: [`The homepage exposes a modified timestamp ${Math.floor(staleDays)} days ago (${page?.updatedAt}).`],
    diagnosticHypotheses: ["A visible timestamp older than 180 days is a freshness signal; it does not prove the page's claims are inaccurate."],
  });
  const confirmedBroken = targetStatus === 404 || targetStatus === 410 || (checkedOwnUrls.some((result) => result.state === "404" || result.state === "410"));
  if (confirmedBroken) findings.push({
    kind: "broken_destination",
    observableEvidence: [`A DNS-pinned HTTP check confirmed ${targetStatus === 404 || targetStatus === 410 ? `the homepage returned ${targetStatus}` : `${checkedOwnUrls.filter((result) => result.state === "404" || result.state === "410").length} same-domain answer URL(s) returned 404 or 410`}.`],
    diagnosticHypotheses: ["A confirmed missing or removed destination can stop readers and crawlers from reaching the cited content."],
  });
  const diagnosticSummary = findings.length ? `Observed ${findings.length} potential blocker signal${findings.length === 1 ? "" : "s"}: ${[...new Set(findings.map((item) => item.kind))].join(", ")}.` : "No blocker signal was observable in this single scan.";
  return {
    domain: origin.hostname,
    status: probe && page && targetStatus !== null ? "complete" : "partial",
    runMode: probe ? "groq_tavily_modeled_answer" : "page_only",
    diagnosticSummary,
    citationSummary: { modeledAnswerAvailable: !!probe, ownDomainUrlMentions: probe ? ownDomainUrls.length : null, verifiedBrokenUrls: brokenCount, missingCitationCount: missingCount, brokenOrMissingCount },
    pageEvidence: { httpStatus: targetStatus, sitemapCheckAvailable: sitemapAvailable, homepageInSitemap: homeInSitemap, robotsAllows, structuredDataBlocks: page?.jsonLd.length ?? 0, lastModified: page?.updatedAt ?? null, lexicalPromptCoverage: promptCoverage },
    findings,
    limits: [
      "The answer profile is a single Groq-generated simulation with Tavily search context, not a native ChatGPT, Perplexity, Gemini, or Claude observation.",
      "CiteMend cannot inspect private model reasoning. Observable HTTP, sitemap, robots, page timestamp, JSON-LD, and answer URL evidence is separated from hypotheses.",
      "One prompt and one answer are a limited sample; an absent URL here does not prove a domain is never cited.",
    ],
  };
}
