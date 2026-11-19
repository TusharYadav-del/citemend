import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLinkHealth, draftReplacementSnippet, failedDestinationKey, lookupWaybackSnapshot, verifyLiveReplacementUrl } from "../lib/link-health";

test("treats 404 and 410 as permanent and never retries them", async () => {
  for (const status of [404, 410]) {
    let attempts = 0;
    const result = await checkLinkHealth(async () => { attempts++; return { httpStatus: status }; }, { wait: async () => assert.fail("permanent dead links must not wait") });
    assert.equal(result.classification, "permanent_dead");
    assert.equal(result.attempts, 1);
    assert.equal(attempts, 1);
    assert.equal(result.retryable, false);
  }
});

test("retries temporary statuses with bounded exponential backoff and returns the final result", async () => {
  const statuses = [503, 429, 200];
  const waits: number[] = [];
  const result = await checkLinkHealth(async () => ({ httpStatus: statuses.shift() ?? 200 }), { wait: async ms => { waits.push(ms); } });
  assert.equal(result.classification, "healthy");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.attempts, 3);
  assert.deepEqual(waits, [150, 300]);
});

test("keeps an exhausted 5xx as temporary rather than permanent link rot", async () => {
  let attempts = 0;
  const result = await checkLinkHealth(async () => { attempts++; return { httpStatus: 503 }; }, { wait: async () => {} });
  assert.equal(attempts, 3);
  assert.equal(result.classification, "temporary_failure");
  assert.equal(result.httpStatus, 503);
  assert.equal(result.retryable, true);
});

test("Wayback lookup returns a validated dated snapshot and safely ignores unusable API results", async () => {
  const requested: URL[] = [];
  const fetcher = async (input: string | URL) => {
    requested.push(new URL(String(input)));
    return Response.json({ archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/20240102030405/https://shop.example.com/products/boots", timestamp: "20240102030405", statuscode: "200" } } });
  };
  const result = await lookupWaybackSnapshot("https://www.shop.example.com/products/boots#details", fetcher);
  assert.deepEqual(result, { url: "https://web.archive.org/web/20240102030405/https://shop.example.com/products/boots", capturedAt: "2024-01-02T03:04:05Z", originalStatus: 200 });
  assert.equal(requested[0].hostname, "archive.org");
  assert.equal(requested[0].searchParams.get("url"), "https://www.shop.example.com/products/boots");
  const unsafe = await lookupWaybackSnapshot("https://example.com/page", async () => Response.json({ archived_snapshots: { closest: { available: true, url: "https://attacker.example/web/20240102030405/https://example.com/", timestamp: "20240102030405", statuscode: 200 } } }));
  assert.equal(unsafe, null);
  assert.equal(await lookupWaybackSnapshot("file:///etc/passwd"), null);
});

test("normalizes failed destination keys and drafts a factual link-only replacement snippet", () => {
  assert.equal(failedDestinationKey("https://WWW.Example.com:443/old-guide#top"), "https://example.com/old-guide");
  assert.equal(draftReplacementSnippet("https://example.com/guides/old-guide"), "Suggested replacement link: “old guide” — https://example.com/guides/old-guide");
  assert.equal(draftReplacementSnippet("javascript:alert(1)"), null);
});

test("accepts only direct HTTP 200 replacements on the customer domain", async () => {
  const checked: string[] = [];
  assert.deepEqual(await verifyLiveReplacementUrl("https://attacker.example/live", "example.com", async url => { checked.push(url); return 200; }), { live: false, temporaryFailure: false });
  assert.equal(checked.length, 0);
  assert.deepEqual(await verifyLiveReplacementUrl("https://www.example.com/live", "example.com", async url => { checked.push(url); return 200; }), { live: true, temporaryFailure: false });
  assert.deepEqual(await verifyLiveReplacementUrl("https://example.com/temp", "example.com", async () => 503), { live: false, temporaryFailure: true });
});
