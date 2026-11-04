import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { checkUrlStatus, fetchSitemapUrls, verifyUrl } from "../lib/seo";

const nativeFetch = globalThis.fetch;
afterEach(() => { mock.restoreAll(); globalThis.fetch = nativeFetch; });
const site = "https://example.com";
const urlset = (locs: string[]) => `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((loc) => `<url><loc>${loc}</loc></url>`).join("")}</urlset>`;
const index = (locs: string[]) => `<sitemapindex>${locs.map((loc) => `<sitemap><loc>${loc}</loc></sitemap>`).join("")}</sitemapindex>`;
function routes(map: Record<string, () => Response>) {
  const calls: { url: string; method: string }[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    const route = map[`${method} ${url}`] ?? map[url];
    if (!route) throw new Error(`Unexpected request ${method} ${url}`);
    return route();
  });
  return calls;
}

test("extracts direct loc values, decodes XML entities, deduplicates and skips invalid URLs", async () => {
  routes({ [`${site}/sitemap.xml`]: () => new Response(urlset([`${site}/a?x=1&amp;y=2`, `${site}/a?x=1&amp;y=2`, "javascript:alert(1)", "/relative", "https://user:password@example.com/secret"])) });
  assert.deepEqual(await fetchSitemapUrls("example.com"), [`${site}/a?x=1&y=2`]);
});

test("supports namespace prefixes, CDATA, and ignores image extension loc elements", async () => {
  routes({ [`${site}/sitemap.xml`]: () => new Response(`<sm:urlset xmlns:sm="urn:sitemap" xmlns:image="urn:image"><sm:url><sm:loc><![CDATA[${site}/article]]></sm:loc><image:image><image:loc>${site}/photo.jpg</image:loc></image:image></sm:url></sm:urlset>`) });
  assert.deepEqual(await fetchSitemapUrls("example.com"), [`${site}/article`]);
});

test("traverses indexes, gzip documents, and cycles without duplicate requests", async () => {
  const calls = routes({
    [`${site}/sitemap.xml`]: () => new Response(index([`${site}/child.xml.gz`, `${site}/sitemap.xml`])),
    [`${site}/child.xml.gz`]: () => new Response(gzipSync(urlset([`${site}/one`, `${site}/two`]))),
  });
  assert.deepEqual(await fetchSitemapUrls(site), [`${site}/one`, `${site}/two`]);
  assert.equal(calls.length, 2);
});

test("falls back to robots directives and combines multiple advertised sitemaps", async () => {
  routes({
    [`${site}/sitemap.xml`]: () => new Response("missing", { status: 404 }),
    [`${site}/robots.txt`]: () => new Response(`User-agent: *\r\nSitemap: ${site}/one.xml\r\nsitemap: /two.xml # comment\r\nSitemap: file:///bad`),
    [`${site}/one.xml`]: () => new Response(urlset([`${site}/one`])),
    [`${site}/two.xml`]: () => new Response(urlset([`${site}/two`, `${site}/one`])),
  });
  assert.deepEqual(await fetchSitemapUrls("example.com"), [`${site}/one`, `${site}/two`]);
});

test("falls back when the default sitemap is HTML or malformed XML", async () => {
  routes({
    [`${site}/sitemap.xml`]: () => new Response("<html><body>not a sitemap</body></html>"),
    [`${site}/robots.txt`]: () => new Response(`Sitemap: ${site}/valid.xml`),
    [`${site}/valid.xml`]: () => new Response(urlset([`${site}/valid`])),
  });
  assert.deepEqual(await fetchSitemapUrls("example.com"), [`${site}/valid`]);
});

test("empty valid sitemaps return an empty array; missing discovery rejects", async () => {
  routes({ [`${site}/sitemap.xml`]: () => new Response("<urlset/>") });
  assert.deepEqual(await fetchSitemapUrls("example.com"), []);
  mock.restoreAll();
  routes({ [`${site}/sitemap.xml`]: () => new Response("missing", { status: 404 }), [`${site}/robots.txt`]: () => new Response("User-agent: *") });
  await assert.rejects(fetchSitemapUrls("example.com"), /No usable sitemap/);
});

test("rejects entity declarations and never returns partial index results", async () => {
  routes({
    [`${site}/sitemap.xml`]: () => new Response(index([`${site}/one.xml`, `${site}/bad.xml`])),
    [`${site}/one.xml`]: () => new Response(urlset([`${site}/one`])),
    [`${site}/bad.xml`]: () => new Response('<!DOCTYPE urlset [<!ENTITY x "bad">]><urlset/>'),
    [`${site}/robots.txt`]: () => new Response(`Sitemap: ${site}/bad.xml`),
  });
  await assert.rejects(fetchSitemapUrls("example.com"), /must not contain a DTD/);
});

test("HEAD preserves 200/404/500 and follows redirects to their final status", async () => {
  const calls = routes({
    [`HEAD ${site}/ok`]: () => new Response(null, { status: 200 }),
    [`HEAD ${site}/missing`]: () => new Response(null, { status: 404 }),
    [`HEAD ${site}/error`]: () => new Response(null, { status: 500 }),
    [`HEAD ${site}/redirect`]: () => new Response(null, { status: 301, headers: { location: "/missing" } }),
  });
  assert.equal(await checkUrlStatus(`${site}/ok`), 200);
  assert.equal(await checkUrlStatus(`${site}/missing`), 404);
  assert.equal(await checkUrlStatus(`${site}/error`), 500);
  assert.equal(await checkUrlStatus(`${site}/redirect`), 404);
  assert.ok(calls.every((call) => call.method === "HEAD"));
});

test("HEAD rejection falls back to GET, returning the GET status", async () => {
  for (const rejected of [403, 405, 501]) {
    const calls = routes({ [`HEAD ${site}/page`]: () => new Response(null, { status: rejected }), [`GET ${site}/page`]: () => new Response("missing", { status: 404 }) });
    assert.equal(await checkUrlStatus(`${site}/page`), 404);
    assert.deepEqual(calls.map((call) => call.method), ["HEAD", "GET"]);
    mock.restoreAll();
  }
});

test("redirect loops and unsafe redirect protocols reject", async () => {
  routes({ [`${site}/loop`]: () => new Response(null, { status: 302, headers: { location: "/loop" } }), [`${site}/unsafe`]: () => new Response(null, { status: 302, headers: { location: "file:///etc/passwd" } }) });
  await assert.rejects(checkUrlStatus(`${site}/loop`), /Too many redirects/);
  await assert.rejects(checkUrlStatus(`${site}/unsafe`), /HTTP\(S\)/);
});

test("invalid inputs reject before making requests; network failures are not 404", async () => {
  const calls = routes({});
  await assert.rejects(fetchSitemapUrls("example.com/path"), /without a path/);
  await assert.rejects(checkUrlStatus("ftp://example.com/page"), /HTTP\(S\)/);
  assert.equal(calls.length, 0);
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => { throw new TypeError("network unavailable"); });
  await assert.rejects(checkUrlStatus(`${site}/page`), /network unavailable/);
});

test("real network timeout aborts a stalled response instead of inventing a status", async () => {
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  mock.method(AbortSignal, "timeout", () => originalTimeout(50));
  mock.method(globalThis, "fetch", (_url: string | URL, init: RequestInit) => nativeFetch(`http://127.0.0.1:${address.port}/slow`, { method: init.method, signal: init.signal }));
  try {
    await assert.rejects(checkUrlStatus("https://example.com/slow"), { name: "TimeoutError" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("normalizes schemes, trailing slashes, and www hostnames", async () => {
  routes({ "https://www.example.com/sitemap.xml": () => new Response(urlset(["https://www.example.com/page"])) });
  assert.deepEqual(await fetchSitemapUrls("https://www.example.com/"), ["https://www.example.com/page"]);
});
test("410 is preserved and each redirect is screened for private destinations", async () => {
  routes({ [`${site}/gone`]: () => new Response(null, { status: 410 }), [`${site}/private`]: () => new Response(null, { status: 302, headers: {location: "http://169.254.169.254/metadata"} }) });
  assert.equal(await checkUrlStatus(`${site}/gone`), 410);
  await assert.rejects(checkUrlStatus(`${site}/private`), /Private/);
});
test("uses an eight-second request budget and a browser-compatible User-Agent", async () => {
  const original = AbortSignal.timeout.bind(AbortSignal);
  const budgets: number[] = [];
  mock.method(AbortSignal, "timeout", (ms: number) => { budgets.push(ms); return original(ms); });
  mock.method(globalThis, "fetch", async (_url: string | URL, init: RequestInit) => {
    assert.match(String((init.headers as Record<string,string>)["User-Agent"]), /Mozilla\/5\.0.*Citemend/);
    return init.method === "HEAD" ? new Response(null) : new Response("<urlset/>");
  });
  await fetchSitemapUrls("example.com/");
  await checkUrlStatus(`${site}/ok`);
  assert.deepEqual(budgets, [8000, 8000]);
});

test("URL verification returns every supported state without treating failures as 404", async () => {
  routes({
    [`HEAD ${site}/ok`]: () => new Response(null, { status: 200 }),
    [`HEAD ${site}/missing`]: () => new Response(null, { status: 404 }),
    [`HEAD ${site}/gone`]: () => new Response(null, { status: 410 }),
    [`HEAD ${site}/moved`]: () => new Response(null, { status: 301, headers: { location: "/new" } }),
    [`HEAD ${site}/other`]: () => new Response(null, { status: 503 }),
  });
  assert.equal((await verifyUrl(`${site}/ok`)).state, "200");
  assert.equal((await verifyUrl(`${site}/missing`)).state, "404");
  assert.equal((await verifyUrl(`${site}/gone`)).state, "410");
  assert.equal((await verifyUrl(`${site}/moved`)).state, "301");
  assert.equal((await verifyUrl(`${site}/other`)).state, "unknown");
  assert.equal((await verifyUrl("ftp://example.com/page")).state, "hallucinated");
  assert.equal((await verifyUrl("http://127.0.0.1/private")).state, "blocked");
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => { throw new DOMException("The operation timed out", "TimeoutError"); });
  assert.equal((await verifyUrl(`${site}/slow`)).state, "timeout");
});
