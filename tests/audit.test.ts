import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { AuditInputError, extractCitationUrls, runAudit, validateAuditInput, type AuditReport } from "../lib/audit-pipeline";
import { persistAudit, AuditStorageError } from "../lib/audit-store";
import { GET, POST } from "../app/api/audit/route";
import type { CitationProbeResult } from "../lib/gemini";

const originalEnv = process.env;
const originalFetch = globalThis.fetch;
beforeEach(() => { process.env = { ...originalEnv, NODE_ENV: "development", GEMINI_API_KEY: "test-google-key", GROQ_API_KEY: "test-groq-key", GROQ_MODEL: "llama-3.3-70b-versatile", TAVILY_API_KEY: "test-tavily-key", NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key" }; });
afterEach(() => { mock.restoreAll(); globalThis.fetch = originalFetch; process.env = originalEnv; });
const input = { domain: "example.com", buyerPrompt: "Find the documentation." };
const probe: CitationProbeResult = {
  text: "See [setup](https://example.com/docs/setup-old). Also https://other.com/docs/setup and https://example.com.evil.org/docs/setup",
  sources: [{ index: 0, url: "https://example.com/docs/setup-old#part", title: "Old setup" }],
  citations: [], groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/docs/api", title: "API" } }] },
};
const save = async () => ({ id: "audit-id", createdAt: "2026-10-30T00:00:00Z" });

test("validates input before any provider call", async () => {
  for (const value of [null, {}, { ...input, buyerPrompt: " " }, { ...input, domain: "127.0.0.1" }, { ...input, domain: "https://example.com/path" }, { ...input, domain: "example.com:8080" }]) assert.throws(() => validateAuditInput(value), AuditInputError);
  assert.deepEqual(validateAuditInput({ domain: " Example.COM ", buyerPrompt: " Find docs " }), { domain: "example.com", buyerPrompt: "Find docs" });
});

test("extracts Markdown and metadata URLs, deduplicates fragments, and ignores non-http schemes", () => {
  const urls = extractCitationUrls(probe);
  assert.ok(urls.includes("https://example.com/docs/setup-old"));
  assert.ok(urls.includes("https://example.com/docs/api"));
  assert.equal(urls.filter((url) => url === "https://example.com/docs/setup-old").length, 1);
});

test("checks only target-domain citations and verifies next-best live sitemap destination", async () => {
  const checked: string[] = [];
  let stored: AuditReport | undefined;
  const report = await runAudit(input, {
    probe: async () => probe,
    sitemap: async () => ["https://example.com/docs/setup-old-v2", "https://example.com/docs/setup", "https://other.com/docs/setup"],
    check: async (url) => { checked.push(url); return url.endsWith("setup-old") || url.endsWith("setup-old-v2") ? 404 : 200; },
    save: async (value) => { stored = value; return save(); },
  });
  assert.equal(report.status, "completed");
  assert.equal(report.findings.length, 2);
  assert.equal(report.findings.find((item) => item.httpStatus === 404)?.suggestedRedirect, "https://example.com/docs/setup");
  assert.ok(checked.every((url) => new URL(url).hostname === "example.com"));
  assert.equal(new Set(checked).size, checked.length);
  assert.ok(stored);
});

test("resolves Google grounding wrappers before target-domain filtering", async () => {
  const report = await runAudit(input, {
    probe: async () => ({ ...probe, text: "", sources: [], groundingMetadata: { groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/test" } }] } }),
    resolve: async () => "https://example.com/docs/api", sitemap: async () => [], check: async () => 200, save,
  });
  assert.deepEqual(report.findings.map((item) => item.url), ["https://example.com/docs/api"]);
});

test("network failures remain unknown, unavailable sitemaps produce partial reports", async () => {
  const report = await runAudit(input, { probe: async () => probe, sitemap: async () => { throw new Error("offline"); }, check: async () => { throw new Error("timeout"); }, save });
  assert.equal(report.status, "partial");
  assert.ok(report.findings.every((item) => item.httpStatus === null && item.suggestedRedirect === null));
  assert.ok(report.warnings.length >= 2);
});

test("never suggests an unchecked, failed, or missing URL", async () => {
  const report = await runAudit(input, { probe: async () => probe, sitemap: async () => ["https://example.com/docs/setup"], check: async () => 404, save });
  assert.ok(report.findings.every((item) => item.suggestedRedirect === null));
});

test("provider and persistence failures reject instead of reporting success", async () => {
  let saved = false;
  await assert.rejects(runAudit(input, { probe: async () => { throw new Error("provider down"); }, save: async () => { saved = true; return save(); } }), /provider down/);
  assert.equal(saved, false);
  await assert.rejects(runAudit(input, { probe: async () => probe, sitemap: async () => [], check: async () => 200, save: async () => { throw new Error("database down"); } }), /database down/);
});

function apiRequest(body: string, contentType = "application/json") {
  return new Request("http://localhost/api/audit", { method: "POST", headers: { "content-type": contentType }, body });
}

test("GET remains compatible; POST rejects malformed input and production access", async () => {
  assert.deepEqual(await (await GET()).json(), { status: "ok", message: "CiteMind audit API placeholder" });
  assert.equal((await POST(apiRequest("{"))).status, 400);
  assert.equal((await POST(apiRequest("{}"))).status, 400);
  assert.equal((await POST(apiRequest("{}", "text/plain"))).status, 415);
  assert.equal((await POST(apiRequest('"' + "x".repeat(17000) + '"'))).status, 413);
  process.env = { ...process.env, NODE_ENV: "production" };
  assert.equal((await POST(apiRequest(JSON.stringify(input)))).status, 403);
});

test("POST runs real SDK/parser/checker/store code against controlled HTTP fixtures", async () => {
  let insertCount = 0;
  let persistedLinks: unknown;
  const id = "00000000-0000-4000-8000-000000000005";
  mock.method(globalThis, "fetch", async (value: string | URL, options?: RequestInit) => {
    const url = String(value), method = options?.method ?? "GET";
    if (url.includes("api.tavily.com")) return Response.json({ results: [{ url: "https://example.com/docs/api", title: "API", content: "Official API docs" }] });
    if (url.includes("api.groq.com")) return Response.json({ choices: [{ message: { content: probe.text } }] });
    if (url === "https://example.com/sitemap.xml") return new Response('<urlset><url><loc>https://example.com/docs/setup</loc></url></urlset>');
    if (url.startsWith("https://example.com/")) return new Response(null, { status: url.endsWith("setup-old") ? 404 : 200 });
    if (url.startsWith("https://db.example.com/rest/v1/audits") && method === "POST") { insertCount++; return Response.json({ id, created_at: "2026-10-30T00:00:00Z" }); }
    if (url.startsWith("https://db.example.com/rest/v1/broken_links")) { persistedLinks = JSON.parse(String(options?.body)); return new Response(null, { status: 201 }); }
    if (url.startsWith("https://db.example.com/rest/v1/audits") && method === "GET") return Response.json({ id, status: "completed", broken_links: [{ id: "child-id" }] });
    if (url.startsWith("https://db.example.com/rest/v1/audits") && method === "PATCH") return new Response(null, { status: 204 });
    throw new Error(`Unexpected fixture request: ${method} ${url}`);
  });
  const response = await POST(apiRequest(JSON.stringify(input)));
  assert.equal(response.status, 201);
  const report = await response.json();
  assert.equal(report.auditId, id);
  assert.equal(report.findings[0].suggestedRedirect, "https://example.com/docs/setup");
  assert.equal(insertCount, 1);
  assert.deepEqual(persistedLinks, [{ audit_id: id, cited_url: "https://example.com/docs/setup-old", http_status: 404, suggested_redirect: "https://example.com/docs/setup" }]);
});

test("POST returns a safe Groq 429 without writing to Supabase", async () => {
  mock.method(globalThis, "fetch", async (value: string | URL) => {
    if (String(value).includes("api.tavily.com")) return Response.json({ results: [] });
    assert.ok(String(value).includes("api.groq.com"));
    return Response.json({ error: { code: 429, message: "quota details with sensitive request data", status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
  });
  const response = await POST(apiRequest(JSON.stringify(input)));
  assert.equal(response.status, 429);
  const result = await response.json();
  assert.equal(result.stage, "probe");
  assert.equal(result.provider, "groq");
  assert.ok(!JSON.stringify(result).includes("sensitive"));
});

test("failed child persistence removes only the new parent and missing credentials make no calls", async () => {
  const methods: string[] = [];
  const report: AuditReport = { domain: input.domain, buyerPrompt: input.buyerPrompt, generatedText: "sample", groundingMetadata: null, extractedUrls: [], sitemapUrlCount: 0, findings: [{ url: "https://example.com/missing", httpStatus: 404, error: null, suggestedRedirect: null }], warnings: [], status: "completed" };
  mock.method(globalThis, "fetch", async (value: string | URL, options?: RequestInit) => {
    methods.push(options?.method ?? "GET");
    if (String(value).includes("broken_links")) return Response.json({ code: "23503", message: "failed insert" }, { status: 400 });
    if (options?.method === "DELETE") { assert.ok(String(value).includes("new-audit")); return new Response(null, { status: 204 }); }
    return Response.json({ id: "new-audit", created_at: "now" });
  });
  await assert.rejects(persistAudit(report), /partial rows were removed/);
  assert.deepEqual(methods, ["POST", "POST", "DELETE"]);
  delete process.env.SUPABASE_SECRET_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await assert.rejects(persistAudit(report), AuditStorageError);
  assert.equal(methods.length, 3);
});

test("path similarity handles typos, and no-404 reports do not invent broken links", async () => {
  const typoProbe = { ...probe, text: "See https://example.com/prcing", sources: [], groundingMetadata: { groundingChunks: [] } };
  const report = await runAudit(input, { probe: async () => typoProbe, sitemap: async () => ["https://example.com/contact", "https://example.com/pricing"], check: async (url) => url.endsWith("prcing") ? 404 : 200, save });
  assert.equal(report.findings[0].suggestedRedirect, "https://example.com/pricing");
  const healthy = await runAudit(input, { probe: async () => probe, sitemap: async () => [], check: async () => 200, save });
  assert.ok(healthy.findings.every((item) => item.httpStatus === 200 && item.suggestedRedirect === null));
});

// Provider regression checks: Tavily evidence and generated URLs remain distinct.
import { runCitationProbe as runGroqProbe, CitationProviderError } from "../lib/citation-probe";

test("Groq probe combines search-only and generated URLs and bounds provider requests", async () => {
  let groqBody: Record<string, unknown> | undefined;
  mock.method(globalThis, "fetch", async (value: string | URL, options?: RequestInit) => {
    if (String(value).includes("api.tavily.com")) {
      assert.ok(options?.signal);
      return Response.json({ results: [{ url: "https://example.com/search-only", title: "Search result", content: "Evidence" }, { url: "javascript:alert(1)" }] });
    }
    groqBody = JSON.parse(String(options?.body));
    return Response.json({ choices: [{ message: { content: "See [pricing](https://example.com/pricing). Also https://example.com/search-only" } }] });
  });
  const result = await runGroqProbe("https://example.com/", "Find pricing");
  assert.equal(result.providerUsed, "groq-llama-3.3-70b-versatile");
  assert.equal(result.searchGrounding.status, "available");
  assert.deepEqual(result.citedUrls, ["https://example.com/search-only", "https://example.com/pricing"]);
  assert.equal(groqBody?.model, "llama-3.3-70b-versatile");
  assert.ok(JSON.stringify(groqBody).includes("Evidence"));
  assert.deepEqual(extractCitationUrls(result), result.citedUrls.slice().sort((a, b) => a.endsWith("pricing") ? -1 : b.endsWith("pricing") ? 1 : 0));
});

test("Tavily failure is visible while Groq can still generate an ungrounded answer", async () => {
  mock.method(globalThis, "fetch", async (value: string | URL) => String(value).includes("api.tavily.com") ? new Response(null, { status: 429 }) : Response.json({ choices: [{ message: { content: "See https://example.com/docs" } }] }));
  const result = await runGroqProbe("example.com", "Find docs");
  assert.equal(result.searchGrounding.status, "unavailable");
  assert.ok(result.warnings.length);
  assert.equal(result.searchGrounding.sources.length, 0);
});

test("missing Tavily configuration is disclosed; missing Groq key makes no provider call", async () => {
  delete process.env.TAVILY_API_KEY;
  let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ choices: [{ message: { content: "Known documentation URLs." } }] }); });
  const result = await runGroqProbe("example.com", "Find docs");
  assert.equal(result.searchGrounding.status, "not_configured");
  assert.ok(result.warnings.length);
  delete process.env.GROQ_API_KEY;
  await assert.rejects(runGroqProbe("example.com", "Find docs"), /GROQ_API_KEY/);
  assert.equal(calls, 1);
});

test("malformed Tavily results are disclosed and empty Groq output rejects", async () => {
  mock.method(globalThis, "fetch", async (value: string | URL) => String(value).includes("api.tavily.com") ? Response.json({ unexpected: [] }) : Response.json({ choices: [] }));
  await assert.rejects(runGroqProbe("example.com", "Find docs"), CitationProviderError);
});

test("URL-only AI answers strip sentence punctuation without corrupting structured source URLs", () => {
  const result = extractCitationUrls({ ...probe, text: "https://example.com/docs).", sources: [], groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/docs?version=1&mode=full" } }] } });
  assert.deepEqual(result, ["https://example.com/docs", "https://example.com/docs?version=1&mode=full"]);
});

test("rejects numeric IP aliases as invalid domains before provider calls", async () => {
  let calls = 0;
  for (const domain of ["127.1", "127.0.0.01", "0127.0.0.1", "1.2.3.999"]) {
    await assert.rejects(runAudit({ ...input, domain }, { probe: async () => { calls++; return probe; } }), AuditInputError);
  }
  assert.equal(calls, 0);
});

test("body-size limits cancel oversized streams and malformed UTF-8 is rejected", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(17000)); }, cancel() { cancelled = true; } });
  const request = new Request("http://localhost/api/audit", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
  assert.equal((await POST(request)).status, 413);
  assert.equal(cancelled, true);
  const malformed = new Request("http://localhost/api/audit", { method: "POST", headers: { "content-type": "application/json" }, body: new Uint8Array([0xff]) });
  assert.equal((await POST(malformed)).status, 400);
});
