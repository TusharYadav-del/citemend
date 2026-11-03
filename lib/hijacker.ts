import "server-only";
import { checkUrlStatus, indexDomainSitemap } from "./seo";
import { createServerDatabase } from "./supabase-server";
import { generateUrlEmbedding, normalizeUrlEmbedding, urlEmbeddingModel } from "./gemini";

export type CitationBucket = "own_domain" | "competitor_domain" | "third_party_source";
export type CitationClassification = { url: string; domain: string; bucket: CitationBucket };
export type HijackOpportunity = {
  audit_id: string; domain: string;
  opportunity_type: "competitor_direct_404" | "listicle_outbound_404" | "listicle_missing_brand" | "reddit_citation_thread";
  prompt_query: string; cited_engine: string; target_url: string; dead_competitor_url: string | null;
  competitor_domain: string | null; http_status: number | null; matched_user_live_url: string | null;
  similarity_score: number | null; brand_mentioned: boolean; contact_email_or_link: string | null;
  verification_status: "unverified";
};
type Match = { url: string; similarity: number };
export type HijackerDependencies = {
  check: typeof checkUrlStatus;
  embed: typeof generateUrlEmbedding;
  search: (domain: string, embedding: number[]) => Promise<Match[]>;
  save: (opportunities: HijackOpportunity[]) => Promise<void>;
  index: typeof indexDomainSitemap;
};

const DEFAULT_DEPENDENCIES: HijackerDependencies = {
  check: checkUrlStatus,
  embed: generateUrlEmbedding,
  index: indexDomainSitemap,
  search: async (domain, embedding) => {
    const { data, error } = await createServerDatabase().rpc("match_sitemap_url", {
      query_embedding: JSON.stringify(normalizeUrlEmbedding(embedding)), target_domain: domain,
      match_threshold: 0.55, match_count: 1, query_model: urlEmbeddingModel(),
    });
    if (error) throw new Error("Could not search the user's indexed sitemap.");
    return (data ?? []) as Match[];
  },
  save: async (rows) => {
    if (!rows.length) return;
    const { error } = await createServerDatabase().from("citation_hijack_opportunities").insert(rows);
    if (error) throw new Error("Could not save citation hijack opportunities.");
  },
};

const THIRD_PARTY_HOSTS = [
  "reddit.com", "youtube.com", "youtu.be", "wikipedia.org", "medium.com", "substack.com",
  "trustpilot.com", "g2.com", "capterra.com", "getapp.com", "yelp.com", "forbes.com",
  "techcrunch.com", "news.ycombinator.com", "linkedin.com", "facebook.com", "instagram.com",
  "x.com", "twitter.com", "tiktok.com", "quora.com", "crunchbase.com",
];

function hostFor(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}

function belongsTo(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function isThirdPartySource(host: string): boolean {
  return THIRD_PARTY_HOSTS.some((source) => belongsTo(host, source))
    || /(^|\.)(news|blog|reviews?|directory|magazine)\./.test(host);
}

export function classifyCitationUrl(url: string, auditedDomain: string, competitorDomains: string[]): CitationClassification {
  const domain = hostFor(url);
  if (!domain) return { url, domain: "", bucket: "third_party_source" };
  const own = auditedDomain.toLowerCase().replace(/^www\./, "");
  const competitors = competitorDomains.map(value => value.toLowerCase().replace(/^www\./, ""));
  if (belongsTo(domain, own)) return { url, domain, bucket: "own_domain" };
  if (competitors.some(candidate => belongsTo(domain, candidate))) return { url, domain, bucket: "competitor_domain" };
  return { url, domain, bucket: "third_party_source" };
}

/** Infer only external hosts explicitly named in the generated answer; known source directories remain third-party. */
export function inferCompetitorDomains(auditedDomain: string, citationUrls: string[], responseText: string): string[] {
  const text = responseText.toLowerCase();
  const own = auditedDomain.toLowerCase().replace(/^www\./, "");
  const candidates = new Map<string, number>();
  for (const url of citationUrls) {
    const host = hostFor(url);
    if (!host || belongsTo(host, own) || isThirdPartySource(host)) continue;
    const explicitlyNamed = text.includes(host) || text.includes(`www.${host}`);
    if (!explicitlyNamed) continue;
    candidates.set(host, (candidates.get(host) ?? 0) + 1);
  }
  return [...candidates].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([host]) => host);
}

function semanticContext(deadUrl: string, prompt: string): string {
  const parsed = new URL(deadUrl);
  const slug = decodeURIComponent(parsed.pathname).split("/").filter(Boolean).join(" ").replace(/[-_.]+/g, " ");
  return `Competitor page context: ${slug || parsed.hostname}. Buyer query: ${prompt}`.slice(0, 1800);
}

export async function matchDeadCitationToOwnSitemap(
  domain: string, deadUrl: string, prompt: string,
  overrides: Partial<Pick<HijackerDependencies, "embed" | "search">> = {},
): Promise<Match | undefined> {
  const vector = await (overrides.embed ?? DEFAULT_DEPENDENCIES.embed)(semanticContext(deadUrl, prompt));
  return (await (overrides.search ?? DEFAULT_DEPENDENCIES.search)(domain, vector))
    .filter(candidate => {
      const host = hostFor(candidate.url);
      return host !== null && belongsTo(host, domain) && Number.isFinite(candidate.similarity) && candidate.similarity >= 0.55 && candidate.similarity <= 1;
    }).sort((a, b) => b.similarity - a.similarity)[0];
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await fn(items[index]); }
  }));
  return result;
}

export async function findCompetitor404Opportunities(input: {
  auditId: string; domain: string; competitorDomains: string[]; citationUrls: string[];
  prompt: string; citedEngine: string; responseText: string;
}, overrides: Partial<HijackerDependencies> = {}) {
  const deps = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const classifications = [...new Map(input.citationUrls.map(url => [url, classifyCitationUrl(url, input.domain, input.competitorDomains)])).values()];
  const targets = classifications.filter(item => item.bucket === "competitor_domain" && item.domain).slice(0, 50);
  const checked = await mapLimited(targets, 5, async (citation) => {
    try { return { citation, status: await deps.check(citation.url) }; }
    catch { return { citation, status: null }; }
  });
  const dead = checked.filter((item): item is { citation: CitationClassification; status: number } => item.status === 404 || item.status === 410).slice(0, 20);
  if (dead.length) {
    try { await deps.index(input.domain); }
    catch { /* Existing index may still be searchable; retain opportunities without a semantic match. */ }
  }
  const rows = await mapLimited(dead, 3, async ({ citation, status }): Promise<HijackOpportunity> => {
    let match: Match | undefined;
    try {
      match = await matchDeadCitationToOwnSitemap(input.domain, citation.url, input.prompt, deps);
    } catch { /* Keep the dead citation opportunity even when embedding search is unavailable. */ }
    return {
      audit_id: input.auditId, domain: input.domain, opportunity_type: "competitor_direct_404",
      prompt_query: input.prompt.slice(0, 4000), cited_engine: input.citedEngine.slice(0, 100),
      target_url: match?.url ?? `https://${input.domain}/`, dead_competitor_url: citation.url,
      competitor_domain: citation.domain, http_status: status, matched_user_live_url: match?.url ?? null,
      similarity_score: match?.similarity ?? null, brand_mentioned: input.responseText.toLowerCase().includes(input.domain.toLowerCase()),
      contact_email_or_link: null, verification_status: "unverified",
    };
  });
  let warning: string | null = null;
  if (rows.length) {
    try { await deps.save(rows); } catch { warning = "Competitor 404 opportunities were detected but could not be saved."; }
  }
  return { classifications, opportunities: rows, warning };
}
