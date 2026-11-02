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

test("interrupted preview uploads return a client error without checking a site", async () => {
  let calls = 0;
  const post = createSitePreviewHandler({ checkStatus: async () => { calls++; return 200; } });
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.error(new Error("Client disconnected")); },
  });
  const response = await post(new Request("http://localhost/api/preview", {
    method: "POST", body, duplex: "half",
  } as RequestInit));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Enter a valid domain." });
  assert.equal(calls, 0);
});

test("oversized streamed preview bodies are cancelled before reading more", async () => {
  let cancelled = false;
  let calls = 0;
  const post = createSitePreviewHandler({ checkStatus: async () => { calls++; return 200; } });
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(501))); },
    cancel() { cancelled = true; },
  });
  const response = await post(new Request("http://localhost/api/preview", {
    method: "POST", body, duplex: "half",
  } as RequestInit));
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});

test("stalled preview uploads time out and cancel the body", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = false;
  let calls = 0;
  const post = createSitePreviewHandler({ checkStatus: async () => { calls++; return 200; } });
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const pending = post(new Request("http://localhost/api/preview", {
    method: "POST", body, duplex: "half",
  } as RequestInit));
  context.mock.timers.tick(5_000);
  const response = await pending;
  assert.equal(response.status, 408);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});

test("malformed UTF-8 and multi-byte oversized preview bodies are rejected", async () => {
  let calls = 0;
  const post = createSitePreviewHandler({ checkStatus: async () => { calls++; return 200; } });
  const malformed = new Uint8Array([0xff]);
  assert.equal((await post(new Request("http://localhost/api/preview", { method: "POST", body: malformed }))).status, 400);
  assert.equal((await post(request("\u00e9".repeat(250)))).status, 413);
  assert.equal(calls, 0);
});
