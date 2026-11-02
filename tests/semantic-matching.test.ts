import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { generateUrlEmbedding, generateUrlEmbeddings, normalizeUrlEmbedding, UrlEmbeddingError } from "../lib/gemini";
import { indexDomainSitemap, matchSitemapUrls } from "../lib/sitemap-embeddings";
import { selectSitemapPages, urlPathKeywords } from "../lib/url-keywords";
import { runAudit } from "../lib/audit-pipeline";
import { createAuditPostHandler } from "../lib/audit-handler";
import { parseDashboardReport } from "../lib/audit-dashboard";

const originalFetch = globalThis.fetch;
const originalEnv = process.env;
const unit = () => [1, ...Array(767).fill(0)];
beforeEach(() => { process.env = { ...originalEnv, GEMINI_API_KEY: "test-embedding-key", GEMINI_EMBEDDING_MODEL: "gemini-embedding-001", NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-secret" }; });
afterEach(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });

test("URL keywords decode paths; core sitemap selection is deterministic, same-domain, and capped at 200", () => {
  assert.equal(urlPathKeywords("https://example.com/blog/ai-seo-guide?ignored=secret"), "blog ai seo guide");
  assert.equal(urlPathKeywords("https://example.com/enterpriseTier%20Pricing.html"), "enterprise tier pricing");
  const urls = Array.from({length: 250}, (_, i) => `https://example.com/blog/post-${i}`);
  urls.push("https://example.com/pricing", "https://example.com/features", "https://other.com/pricing", "https://example.com/a.pdf", "https://example.com/api/private", "https://example.com/pricing?track=1", "https://example.com/%GG", "https://example.com:8443/pricing");
  const selected = selectSitemapPages("example.com", urls);
  assert.equal(selected.length, 200);
  assert.equal(selected[0].url, "https://example.com/features");
  assert.equal(selected[1].url, "https://example.com/pricing");
  assert.deepEqual(selected, selectSitemapPages("example.com", urls.reverse()));
});

test("Gemini SDK requests bounded 768-dimensional document/query embeddings and normalizes responses", async () => {
  const tasks: string[] = [];
  globalThis.fetch = async (input, init) => {
    assert.ok(String(input).includes("gemini-embedding-001"));
    const body = JSON.parse(String(init?.body));
    const requests = body.requests ?? [body];
    for (const request of requests) {
      assert.equal(request.outputDimensionality, 768);
      tasks.push(request.taskType);
    }
    return Response.json({ embeddings: requests.map(() => ({ values: [2, ...Array(767).fill(0)] })) });
  };
  assert.deepEqual(await generateUrlEmbeddings(["pricing", "features"]), [unit(), unit()]);
  assert.deepEqual(await generateUrlEmbedding("old enterprise tier"), unit());
  assert.deepEqual(tasks, ["RETRIEVAL_DOCUMENT", "RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]);
});

test("invalid vectors, partial batches, rate limits, and timeouts fail safely", async () => {
  for (const values of [[], Array(768).fill(0), [NaN, ...Array(767).fill(0)], Array(768).fill(Infinity)]) assert.throws(() => normalizeUrlEmbedding(values));
  globalThis.fetch = async () => Response.json({ embeddings: [] });
  await assert.rejects(generateUrlEmbedding("pricing"), /incomplete batch/);
  globalThis.fetch = async () => Response.json({ error: { message: "private provider details", status: "RESOURCE_EXHAUSTED", code: 429 } }, {status: 429});
  await assert.rejects(generateUrlEmbedding("pricing"), error => error instanceof Error && !error.message.includes("private") && error instanceof UrlEmbeddingError && error.retryAfterMs === 60_000);
  globalThis.fetch = async () => { throw new DOMException("secret internal endpoint", "TimeoutError"); };
  await assert.rejects(generateUrlEmbedding("pricing"), /temporarily unavailable/);
});

test("sitemap indexing batches only uncached pages, caps at 200, and upserts by domain/url", async () => {
  const rows: Record<string, unknown>[] = [];
  const batchSizes: number[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("domain") ?? "eq.example.com", "eq.example.com");
    if (init?.method === "POST") {
      assert.equal(url.searchParams.get("on_conflict"), "domain,url");
      rows.push(...JSON.parse(String(init.body)));
      return new Response(null, {status: 201});
    }
    assert.equal(url.searchParams.get("embedding_model"), "eq.gemini-embedding-001");
    return Response.json([{url: "https://example.com/pricing", updated_at: new Date().toISOString()}]);
  };
  const result = await indexDomainSitemap("example.com", {
    urls: ["https://example.com/pricing", ...Array.from({length: 205}, (_, i) => `https://example.com/product-${i}`)],
    embed: async (texts, task) => { assert.equal(task, "RETRIEVAL_DOCUMENT"); batchSizes.push(texts.length); return texts.map(unit); },
  });
  assert.equal(result.indexed, 199);
  assert.equal(result.cached, 1);
  assert.equal(result.urls.length, 200);
  assert.equal(rows.length, 199);
  assert.ok(batchSizes.every(count => count <= 20));
  assert.ok(rows.every(row => row.domain === "example.com" && row.embedding_model === "gemini-embedding-001" && JSON.parse(String(row.embedding)).length === 768));
});

test("semantic RPC excludes stale sitemap URLs, other hosts, low confidence, and self redirects", async () => {
  const urls = ["https://example.com/pricing", "https://example.com/old-tier"];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/rpc/")) {
      const args = JSON.parse(String(init?.body));
      assert.equal(args.target_domain, "example.com");
      assert.equal(args.query_model, "gemini-embedding-001");
      return Response.json([
        {url: urls[0], similarity: 0.94},
        {url: "https://other.com/pricing", similarity: 0.99},
        {url: "https://example.com/stale", similarity: 0.99},
        {url: urls[1], similarity: 0.99},
        {url: urls[0], similarity: 0.4},
      ]);
    }
    return Response.json(urls.map(url => ({url, updated_at: new Date().toISOString()})));
  };
  const matches = await matchSitemapUrls("example.com", [urls[1]], urls, {embed: async texts => texts.map(unit)});
  assert.deepEqual(matches.get(urls[1]), [{url: urls[0], similarity: 0.94}]);
});

const broken = "https://example.com/old-2023-enterprise-tier";
const destination = "https://example.com/pricing";
const input = {domain: "example.com", buyerPrompt: "Find enterprise pricing"};
const auditOptions = {
  probe: async () => ({text: broken, citedUrls: [broken], providerUsed: "groq-test", searchGrounding: {status: "available" as const, sources: []}, warnings: []}),
  sitemap: async () => [destination], check: async (url: string) => url === broken ? 404 : 200,
  save: async () => ({id: "saved", createdAt: new Date().toISOString()}),
};

test("authenticated audit response returns a live-verified semantic destination with measured confidence", async () => {
  const post = createAuditPostHandler({isConfigured: () => true, getUserId: async () => "user_test", hasPro: async () => true,
    execute: (input, _overrides, userId) => runAudit(input, {...auditOptions, semantic: async () => new Map([[broken, [{url: destination, similarity: 0.94}]]])}, userId),
  });
  const response = await post(new Request("http://localhost/api/audit", {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(input)}));
  assert.equal(response.status, 201);
  const report = parseDashboardReport(await response.json());
  assert.equal(report.findings[0].suggestedRedirect, destination);
  assert.equal(report.findings[0].matchConfidence, 94);
});

test("semantic candidates must be live; provider failure preserves lexical matching without a confidence score", async () => {
  const dead = await runAudit(input, {...auditOptions, check: async () => 404, semantic: async () => new Map([[broken, [{url: destination, similarity: 0.94}]]])});
  assert.equal(dead.findings[0].suggestedRedirect, null);
  assert.equal(dead.findings[0].matchConfidence, undefined);
  const fallback = await runAudit(input, {...auditOptions, sitemap: async () => ["https://example.com/new-enterprise-tier"], semantic: async () => {throw new Error("private provider message");}});
  assert.equal(fallback.findings[0].suggestedRedirect, "https://example.com/new-enterprise-tier");
  assert.equal(fallback.findings[0].matchConfidence, undefined);
  assert.ok(fallback.warnings.some(warning => warning.includes("Semantic matching was unavailable")));
});

test("report parser rejects fabricated or malformed confidence values", () => {
  const report = {auditId:"saved", domain:"example.com", generatedText:"answer", status:"completed", sitemapUrlCount:1, warnings:[], findings:[{url:broken, httpStatus:404, error:null, suggestedRedirect:destination, matchConfidence:94}]};
  assert.equal(parseDashboardReport(report).findings[0].matchConfidence, 94);
  for (const matchConfidence of [NaN, -1, 101, "94", 0.94]) assert.throws(() => parseDashboardReport({...report, findings:[{...report.findings[0], matchConfidence}]}));
  assert.throws(() => parseDashboardReport({...report, findings:[{...report.findings[0], suggestedRedirect:null}]}));
});
