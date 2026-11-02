import "server-only";
import { createServerDatabase } from "./supabase-server";
import { fetchSitemapUrls } from "./seo";
import { generateUrlEmbeddings, normalizeUrlEmbedding, urlEmbeddingModel } from "./gemini";
import { normalizeDashboardDomain } from "./audit-dashboard";
import { selectSitemapPages, urlPathKeywords } from "./url-keywords";

type EmbeddingDependencies = {
  database?: typeof createServerDatabase;
  embed?: typeof generateUrlEmbeddings;
  discover?: typeof fetchSitemapUrls;
};
export type SitemapIndexOptions = EmbeddingDependencies & { urls?: string[]; signal?: AbortSignal };
export type SemanticMatch = { url: string; similarity: number };
export const SEMANTIC_MATCH_THRESHOLD = 0.75;

/** Index only missing/stale vectors, in bounded batches; fail before matching on errors. */
export async function indexDomainSitemap(domain: string, options: SitemapIndexOptions = {}) {
  const hostname = normalizeDashboardDomain(domain);
  const signal = options.signal ?? AbortSignal.timeout(30_000);
  signal.throwIfAborted();
  const pages = selectSitemapPages(hostname, options.urls ?? await (options.discover ?? fetchSitemapUrls)(hostname));
  if (!pages.length) return { indexed: 0, cached: 0, urls: [] as string[] };
  const db = (options.database ?? createServerDatabase)();
  const model = urlEmbeddingModel();
  const { data: existing, error } = await db.from("sitemap_pages").select("url,updated_at")
    .eq("domain", hostname).eq("embedding_model", model).in("url", pages.map(page => page.url)).abortSignal(signal);
  if (error) throw new Error("Sitemap vector storage is unavailable. Apply migration 009 before enabling semantic matches.");
  const fresh = new Set((existing ?? []).filter(page => Date.parse(page.updated_at) > Date.now() - 7 * 24 * 60 * 60_000).map(page => page.url));
  const pending = pages.filter(page => !fresh.has(page.url));
  const embed = options.embed ?? generateUrlEmbeddings;
  for (let offset = 0; offset < pending.length; offset += 20) {
    signal.throwIfAborted();
    const batch = pending.slice(offset, offset + 20);
    const vectors = await embed(batch.map(page => page.page_title), "RETRIEVAL_DOCUMENT", signal);
    if (vectors.length !== batch.length) throw new Error("The sitemap embedding batch is incomplete.");
    const rows = batch.map((page, index) => ({ ...page, domain: hostname,
      embedding: JSON.stringify(normalizeUrlEmbedding(vectors[index])), embedding_model: model, updated_at: new Date().toISOString() }));
    const { error: saveError } = await db.from("sitemap_pages").upsert(rows, { onConflict: "domain,url" }).abortSignal(signal);
    if (saveError) throw new Error("Sitemap embeddings could not be saved.");
  }
  return { indexed: pending.length, cached: pages.length - pending.length, urls: pages.map(page => page.url) };
}

/** Returns unverified candidates; the audit pipeline must perform a live HTTP check. */
export async function matchSitemapUrls(domain: string, brokenUrls: string[], sitemapUrls: string[], dependencies: EmbeddingDependencies = {}): Promise<Map<string, SemanticMatch[]>> {
  const signal = AbortSignal.timeout(30_000);
  const hostname = normalizeDashboardDomain(domain);
  const index = await indexDomainSitemap(hostname, { ...dependencies, urls: sitemapUrls, signal });
  const result = new Map<string, SemanticMatch[]>();
  if (!index.urls.length) return result;
  const allowed = new Set(index.urls);
  const db = (dependencies.database ?? createServerDatabase)();
  const embed = dependencies.embed ?? generateUrlEmbeddings;
  // Bound provider/RPC work even if the probe reports many broken citations.
  for (let offset = 0; offset < Math.min(brokenUrls.length, 50); offset += 20) {
    signal.throwIfAborted();
    const batch = brokenUrls.slice(offset, Math.min(offset + 20, 50));
    const vectors = await embed(batch.map(urlPathKeywords), "RETRIEVAL_QUERY", signal);
    if (vectors.length !== batch.length) throw new Error("The query embedding batch is incomplete.");
    // Small parallel groups avoid serial database latency without unbounded fan-out.
    for (let start = 0; start < batch.length; start += 5) {
      signal.throwIfAborted();
      await Promise.all(batch.slice(start, start + 5).map(async (broken, position) => {
        const { data, error } = await db.rpc("match_sitemap_url", {
          query_embedding: JSON.stringify(normalizeUrlEmbedding(vectors[start + position])),
          target_domain: hostname, match_threshold: SEMANTIC_MATCH_THRESHOLD, match_count: 20, query_model: urlEmbeddingModel(),
        }).abortSignal(signal);
        if (error) throw new Error("Semantic redirect lookup is unavailable.");
        const candidates = (data ?? []).filter(candidate => {
          try {
            const target = new URL(candidate.url), source = new URL(broken);
            return allowed.has(candidate.url) && target.hostname === source.hostname && target.pathname !== source.pathname
              && Number.isFinite(candidate.similarity) && candidate.similarity >= SEMANTIC_MATCH_THRESHOLD && candidate.similarity <= 1;
          } catch { return false; }
        }).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
        result.set(broken, candidates);
      }));
    }
  }
  return result;
}
