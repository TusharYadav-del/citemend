import assert from "node:assert/strict";
import { test } from "node:test";
import { createPixelInterceptHandler as createHandler, interceptOptions } from "../lib/pixel-intercept";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { findPixelSearchMatch } from "../lib/pixel-search-match";

const candidate = { url: "https://example.com/new", score: 1 };
const createPixelInterceptHandler: typeof createHandler = overrides => createHandler({ quota: async () => true, ...overrides });
const body = { domain: "example.com", brokenPath: "/old", referrer: "https://chatgpt.com/c/123", userAgent: "test" };
function post(value: object) { return new Request("https://citemend.test/api/pixel/intercept", { method: "POST", body: JSON.stringify(value) }); }

test("quota denial and database errors fail closed before lookup", async () => {
  const cached = async () => { throw new Error("lookup must not run"); };
  assert.equal((await createPixelInterceptHandler({ cached, quota: async () => false })(post(body))).status, 429);
  assert.equal((await createPixelInterceptHandler({ cached, quota: async () => { throw new Error("database unavailable"); } })(post(body))).status, 503);
});

test("CORS supports GET, POST and preflight; unrelated traffic is ignored", async () => {
  const handler = createPixelInterceptHandler({ cached: async () => { throw new Error("should not query"); } });
  const preflight = interceptOptions();
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.match(preflight.headers.get("access-control-allow-methods")!, /GET/);
  const response = await handler(post({ ...body, referrer: "https://chatgpt.com.evil.example" }));
  assert.deepEqual(await response.json(), { rescued: false });
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("cached redirect is live checked and logged with latency and attribution", async () => {
  let logged: unknown;
  const handler = createPixelInterceptHandler({ cached: async () => candidate, semantic: async () => { throw new Error("unexpected fallback"); }, check: async () => 200, log: async (input, target, latency) => { logged = { input, target, latency }; } });
  const response = await handler(post(body));
  const result = await response.json();
  assert.equal(result.redirectTo, candidate.url);
  assert.equal(result.similarityScore, 1);
  assert.ok(result.latencyMs >= 0);
  assert.deepEqual((logged as { target: unknown }).target, candidate);
  assert.equal((logged as { input: { referrer: string } }).input.referrer, body.referrer);
});

test("GET uses utm_source and falls back to a verified semantic match", async () => {
  let logged = false;
  const handler = createPixelInterceptHandler({ cached: async () => null, semantic: async () => [{ url: "https://evil.example/x", score: 0.99 }, { url: "https://example.com/new", score: 0.72 }], check: async () => 200, log: async () => { logged = true; } });
  const params = new URLSearchParams({ domain: "example.com", brokenPath: "/old", utm_source: "perplexity.ai" });
  const result = await (await handler(new Request(`https://citemend.test/api/pixel/intercept?${params}`))).json();
  assert.equal(result.redirectTo, "https://example.com/new");
  assert.equal(result.similarityScore, 0.72);
  assert.equal(logged, true);
});

test("simulation requires ownership and never logs; invalid or dead targets are rejected", async () => {
  let logs = 0;
  const dependencies = { cached: async () => candidate, semantic: async () => [], check: async () => 200, log: async () => { logs++; } };
  assert.equal((await createPixelInterceptHandler({ ...dependencies, authorizeSimulation: async () => false })(post({ ...body, simulation: true }))).status, 403);
  const simulated = await createPixelInterceptHandler({ ...dependencies, authorizeSimulation: async () => true })(post({ ...body, simulation: true }));
  assert.equal((await simulated.json()).rescued, true);
  assert.equal(logs, 0);
  const dead = createPixelInterceptHandler({ ...dependencies, check: async () => 404 });
  assert.equal((await (await dead(post(body))).json()).rescued, false);
  assert.equal((await dead(post({ ...body, brokenPath: "//evil.example" }))).status, 400);
});

test("rescue queues alerts only for live AI visits, not forced or simulated traffic", async () => {
  const notifications: string[] = [];
  const handler = createPixelInterceptHandler({ cached: async () => candidate, check: async () => 200, log: async () => {}, authorizeSimulation: async () => true, notify: (_domain, source) => { notifications.push(source); } });
  await handler(post(body));
  await handler(post({ ...body, simulation: true }));
  await handler(post({ ...body, referrer: "", forceIntercept: true }));
  assert.deepEqual(notifications, ["chatgpt.com"]);
});

test("pixel recognizes data-is-404 and sends a request to its script origin", async () => {
  let requested = "";
  const script = { src: "https://citemend.test/citemend-pixel.js", dataset: { domain: "example.com" }, getAttribute: (name: string) => name === "data-is-404" ? "true" : null };
  const document = { currentScript: script, readyState: "complete", title: "Missing", referrer: "https://chatgpt.com", querySelector: () => null };
  runInNewContext(readFileSync("public/citemend-pixel.js", "utf8"), { document, location: { hostname: "example.com", pathname: "/old", search: "" }, navigator: { userAgent: "test" }, URL, URLSearchParams, fetch: async (url: URL) => { requested = url.href; return { ok: false }; } });
  assert.equal(requested, "https://citemend.test/api/pixel/intercept");
});

test("Tavily and Groq select only a sufficiently confident same-domain search result", async () => {
  const originalFetch = globalThis.fetch;
  const previousTavily = process.env.TAVILY_API_KEY;
  const previousGroq = process.env.GROQ_API_KEY;
  process.env.TAVILY_API_KEY = "test";
  process.env.GROQ_API_KEY = "test";
  let selection = { url: "https://example.com/new", confidence: 0.81 };
  let groqCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.tavily.com")) {
      const query = JSON.parse(String(init?.body));
      assert.deepEqual(query.include_domains, ["example.com"]);
      return Response.json({ results: [{ url: "https://example.com/new", title: "New page" }, { url: "https://evil.example/new", title: "External" }] });
    }
    assert.match(String(input), /api\.groq\.com/);
    groqCalls++;
    const request = JSON.parse(String(init?.body));
    assert.ok(!JSON.stringify(request.messages).includes("evil.example"));
    return Response.json({ choices: [{ message: { content: JSON.stringify(selection) } }] });
  };
  try {
    assert.deepEqual(await findPixelSearchMatch("example.com", "/old"), [{ url: "https://example.com/new", score: 0.81 }]);
    selection = { url: "https://example.com/hallucinated", confidence: 0.99 };
    assert.deepEqual(await findPixelSearchMatch("example.com", "/old"), []);
    selection = { url: "https://example.com/new", confidence: 0.69 };
    assert.deepEqual(await findPixelSearchMatch("example.com", "/old"), []);
    assert.equal(groqCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousTavily === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previousTavily;
    if (previousGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previousGroq;
  }
});
