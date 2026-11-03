import "server-only";
import { load } from "cheerio";
import { assertPublicUrl, publicFetch } from "./public-http";
import { checkUrlStatus, indexDomainSitemap } from "./seo";
import { createServerDatabase } from "./supabase-server";
import { matchDeadCitationToOwnSitemap, type HijackOpportunity } from "./hijacker";

const MAX_ARTICLES = 6;
const MAX_LINKS_PER_ARTICLE = 5;
const MAX_HTML_BYTES = 2_000_000;
const BROWSER_AGENT = "Mozilla/5.0 (compatible; Citemend/1.0; +https://citemend.vercel.app)";
type Article = { html: string; status: number; url: string };
export type ListicleOpportunity = HijackOpportunity;
export type ListicleCrawlerDependencies = {
  fetchArticle: (url: string) => Promise<Article>;
  check: typeof checkUrlStatus;
  index: typeof indexDomainSitemap;
  match: typeof matchDeadCitationToOwnSitemap;
  save: (rows: ListicleOpportunity[]) => Promise<void>;
};

async function fetchArticle(url: string): Promise<Article> {
  let target = assertPublicUrl(url);
  const signal = AbortSignal.timeout(8000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await publicFetch(target, {
      method: "GET", signal, cache: "no-store",
      headers: { "User-Agent": BROWSER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 3) throw new Error("Article redirected too many times.");
      target = assertPublicUrl(new URL(location, target));
      continue;
    }
    if (!response.ok || !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel();
      throw new Error("Article did not return readable HTML.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Article returned no HTML body.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_HTML_BYTES) { await reader.cancel(); throw new Error("Article exceeded the HTML size limit."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return { html: Buffer.concat(chunks).toString("utf8"), status: response.status, url: target.href };
  }
  throw new Error("Could not fetch article HTML.");
}

function sameDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function competitorHost(url: string, domains: string[]): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return domains.some(domain => host === domain || host.endsWith(`.${domain}`)) ? host : null;
  } catch { return null; }
}

function mentionsBrand(text: string, domain: string, brand: string): boolean {
  if (text.includes(domain.toLowerCase())) return true;
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !!escaped && new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text);
}

function contactFromPage($: ReturnType<typeof load>, baseUrl: string): string | null {
  const email = $("a[href^='mailto:' i]").map((_, element) => $(element).attr("href") ?? "").get()
    .find(value => /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value));
  if (email) return email.slice(0, 320);
  for (const element of $("a[href]").toArray()) {
    const href = $(element).attr("href");
    if (!href) continue;
    try {
      const url = new URL(href, baseUrl);
      if (url.protocol !== "https:") continue;
      if (["linkedin.com", "x.com", "twitter.com", "facebook.com", "instagram.com"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return url.href.slice(0, 1000);
      if (/\/(?:contact|contact-us)(?:\/|$)/i.test(url.pathname) && url.origin === new URL(baseUrl).origin) return url.href.slice(0, 1000);
    } catch { /* Ignore malformed and unsafe contact links. */ }
  }
  return null;
}

function extractCompetitorLinks($: ReturnType<typeof load>, article: Article, domain: string, competitors: string[]): { url: string; host: string }[] {
  const unique = new Map<string, string>();
  for (const element of $("a[href]").toArray()) {
    const href = $(element).attr("href");
    if (!href) continue;
    try {
      const parsed = assertPublicUrl(new URL(href, article.url));
      const host = competitorHost(parsed.href, competitors);
      if (!host || sameDomain(host, domain)) continue;
      parsed.hash = "";
      unique.set(parsed.href, host);
    } catch { /* Ignore non-public, non-HTTP, and malformed links. */ }
    if (unique.size >= MAX_LINKS_PER_ARTICLE) break;
  }
  return [...unique].map(([url, host]) => ({ url, host }));
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; results[index] = await fn(items[index]); }
  }));
  return results;
}

const defaultDependencies: ListicleCrawlerDependencies = {
  fetchArticle,
  check: checkUrlStatus,
  index: indexDomainSitemap,
  match: matchDeadCitationToOwnSitemap,
  save: async (rows) => {
    if (!rows.length) return;
    const { error } = await createServerDatabase().from("citation_hijack_opportunities").insert(rows);
    if (error) throw new Error("Could not save listicle and Reddit opportunities.");
  },
};

export async function inspectThirdPartyCitations(input: {
  auditId: string; domain: string; brandName?: string; competitorDomains: string[];
  thirdPartyUrls: string[]; prompt: string; citedEngine: string;
}, overrides: Partial<ListicleCrawlerDependencies> = {}) {
  const deps = { ...defaultDependencies, ...overrides };
  const domain = input.domain.toLowerCase().replace(/^www\./, "");
  const sources = [...new Set(input.thirdPartyUrls)].filter(url => {
    try { const parsed = new URL(url); return parsed.protocol === "https:" || parsed.protocol === "http:"; } catch { return false; }
  }).slice(0, MAX_ARTICLES);
  const knownCompetitors = [...new Set(input.competitorDomains.map(value => value.toLowerCase().replace(/^www\./, "")))];
  const brand = (input.brandName?.trim() || domain.split(".")[0]).toLowerCase();
  const articleResults = await mapLimited(sources, 2, async (url) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host === "reddit.com" || host === "www.reddit.com" || host === "old.reddit.com") {
        const row: ListicleOpportunity = {
          audit_id: input.auditId, domain, opportunity_type: "reddit_citation_thread", prompt_query: input.prompt.slice(0, 4000),
          cited_engine: input.citedEngine.slice(0, 100), target_url: url, dead_competitor_url: null,
          competitor_domain: null, http_status: null, matched_user_live_url: null, similarity_score: null,
          brand_mentioned: false, contact_email_or_link: null, verification_status: "unverified",
        };
        return { rows: [row], dead: [] as { url: string; host: string; article: Article; brandMentioned: boolean; contact: string | null; status: number }[] };
      }

      const article = await deps.fetchArticle(url);
      const $ = load(article.html);
      const text = $("body").text().replace(/\s+/g, " ").toLowerCase();
      const brandMentioned = mentionsBrand(text, domain, brand);
      const contact = contactFromPage($, article.url);
      const rows: ListicleOpportunity[] = [];
      if (!brandMentioned) rows.push({
        audit_id: input.auditId, domain, opportunity_type: "listicle_missing_brand", prompt_query: input.prompt.slice(0, 4000),
        cited_engine: input.citedEngine.slice(0, 100), target_url: `https://${domain}/`, dead_competitor_url: null,
        competitor_domain: null, http_status: article.status, matched_user_live_url: null, similarity_score: null,
        brand_mentioned: false, contact_email_or_link: contact, verification_status: "unverified",
      });
      const outbound = extractCompetitorLinks($, article, domain, knownCompetitors);
      const checked = await mapLimited(outbound, 2, async link => {
        try { const status = await deps.check(link.url); return status === 404 || status === 410 ? { ...link, article, brandMentioned, contact, status } : null; }
        catch { return null; }
      });
      const dead = checked.filter((value): value is NonNullable<typeof value> => value !== null);
      return { rows, dead };
    } catch {
      return { rows: [] as ListicleOpportunity[], dead: [] as { url: string; host: string; article: Article; brandMentioned: boolean; contact: string | null; status: number }[] };
    }
  });

  const rows = articleResults.flatMap(result => result.rows);
  const dead = articleResults.flatMap(result => result.dead);
  if (dead.length) {
    try { await deps.index(domain); } catch { /* Existing indexed pages may still be searchable. */ }
  }
  const outboundRows = await mapLimited(dead, 3, async item => {
    let match: Awaited<ReturnType<typeof matchDeadCitationToOwnSitemap>>;
    try { match = await deps.match(domain, item.url, input.prompt); } catch { match = undefined; }
    return {
      audit_id: input.auditId, domain, opportunity_type: "listicle_outbound_404" as const,
      prompt_query: input.prompt.slice(0, 4000), cited_engine: input.citedEngine.slice(0, 100),
      target_url: match?.url ?? `https://${domain}/`, dead_competitor_url: item.url,
      competitor_domain: item.host, http_status: item.status, matched_user_live_url: match?.url ?? null,
      similarity_score: match?.similarity ?? null, brand_mentioned: item.brandMentioned,
      contact_email_or_link: item.contact, verification_status: "unverified" as const,
    };
  });
  rows.push(...outboundRows);
  let warning: string | null = null;
  if (rows.length) {
    try { await deps.save(rows); } catch { warning = "Listicle and Reddit opportunities were detected but could not be saved."; }
  }
  return { opportunities: rows, warning };
}
