import assert from "node:assert/strict";
import test from "node:test";
import { createSitePreviewHandler } from "../lib/site-preview";

const request = (domain: unknown) => new Request("http://localhost/api/preview", {
  method: "POST", body: JSON.stringify({ domain }), headers: { "Content-Type": "application/json" },
});

test("public preview checks only the normalized homepage and default sitemap", async () => {
  const urls: string[] = [];
  const post = createSitePreviewHandler({ checkStatus: async (url) => { urls.push(url); return url.endsWith("sitemap.xml") ? 404 : 200; } });
  const response = await post(request("https://Example.com"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { domain: "example.com", homepageStatus: 200, sitemapStatus: 404, previewOnly: true });
  assert.deepEqual(urls, ["https://example.com/", "https://example.com/sitemap.xml"]);
});

test("preview rejects private and malformed input before any network call", async () => {
  let calls = 0;
  const post = createSitePreviewHandler({ checkStatus: async () => { calls++; return 200; } });
  for (const domain of ["127.0.0.1", "localhost", "example.com/admin", "http://example.com:8080", "example.com@evil.test"]) {
    assert.equal((await post(request(domain))).status, 400);
  }
  assert.equal(calls, 0);
});

test("network failures remain unknown rather than pretending a site is healthy", async () => {
  const post = createSitePreviewHandler({ checkStatus: async (url) => {
    if (url.endsWith("sitemap.xml")) throw new Error("Timeout");
    return 503;
  } });
  assert.deepEqual(await (await post(request("example.com"))).json(), { domain: "example.com", homepageStatus: 503, sitemapStatus: null, previewOnly: true });
});
