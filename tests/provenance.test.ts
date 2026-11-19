import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRetrievalConsistency, summarizeProvenanceEvents } from "../lib/provenance-analytics";
import { parseCrawlerName, signProvenanceBody, stableJourneyHash, stableOrderReferenceHash, validProvenanceTimestamp, validateProvenanceEvent, verifyProvenanceSignature } from "../lib/provenance-log-events";

test("crawler names are classified from known AI crawler tokens", () => {
  assert.equal(parseCrawlerName("Mozilla/5.0 (compatible; GPTBot/1.0)"), "GPTBot");
  assert.equal(parseCrawlerName("PerplexityBot/1.0"), "PerplexityBot");
  assert.equal(parseCrawlerName("ClaudeBot/1.0"), "ClaudeBot");
  assert.equal(parseCrawlerName("Google-Extended"), "Google-Extended");
  assert.equal(parseCrawlerName("Mozilla/5.0 (compatible; GPTBot spoof)"), "GPTBot");
  assert.equal(validateProvenanceEvent({ type: "crawler_fetch", userAgent: "GPTBot", url: "https://shop.example.com/p" }, "example.com", "server_log")?.crawler_verified, false);
});

test("crawler verification requires trusted Cloudflare source metadata and a valid IP", () => {
  const input = { type: "crawler_fetch" as const, userAgent: "GPTBot/1.0", url: "https://www.example.com/products/a", verifiedBot: true, clientIp: "203.0.113.10" };
  assert.equal(validateProvenanceEvent(input, "example.com", "cloudflare_logpush")?.crawler_verified, true);
  assert.equal(validateProvenanceEvent({ ...input, clientIp: "not-an-ip" }, "example.com", "cloudflare_logpush")?.crawler_verified, false);
  assert.equal(validateProvenanceEvent(input, "example.com", "server_log")?.crawler_verified, false);
});

test("ingestion signature is timestamp-bound and rejects stale or changed payloads", () => {
  const now = 1_800_000_000_000;
  const timestamp = String(Math.floor(now / 1000));
  const raw = '{"events":[]}';
  const signature = signProvenanceBody(raw, timestamp, "test-secret");
  assert.equal(verifyProvenanceSignature(raw, timestamp, signature, "test-secret", now), true);
  assert.equal(verifyProvenanceSignature(`${raw} `, timestamp, signature, "test-secret", now), false);
  assert.equal(verifyProvenanceSignature(raw, String(Number(timestamp) - 301), signature, "test-secret", now), false);
});

test("referral and commerce events are normalized, domain-scoped, and stored without raw identifiers", () => {
  const referral = validateProvenanceEvent({ type: "ai_referral", referrer: "https://www.chatgpt.com/", url: "https://example.com/products/1" }, "example.com", "server_log");
  assert.equal(referral?.referral_host, "chatgpt.com");
  assert.equal(validateProvenanceEvent({ type: "ai_referral", referrer: "https://chatgpt.com.attacker.test/" }, "example.com", "server_log"), null);
  assert.equal(validateProvenanceEvent({ type: "crawler_fetch", userAgent: "ClaudeBot", url: "https://attacker.test/" }, "example.com", "server_log"), null);
  const first = stableJourneyHash("session-1", "secret");
  assert.equal(first, stableJourneyHash("session-1", "secret"));
  assert.notEqual(first, "session-1");
  assert.notEqual(first, stableJourneyHash("session-2", "secret"));
  assert.notEqual(stableOrderReferenceHash("order-1", "secret"), "order-1");
  assert.equal(validProvenanceTimestamp(new Date(Date.now() - 31 * 86_400_000).toISOString()), null);
});

test("multi-run consistency separates retrieved and rendered links and labels owned citation authority", () => {
  const result = buildRetrievalConsistency([
    { prompt_query: "Best travel mug?", provider: "groq", model_name: "m1", retrieved_urls_json: ["https://example.com/a"], rendered_urls_json: ["https://publisher.test/review"], extracted_urls_json: [], raw_answer: "Example mugs are sturdy.", observed_at: "2026-01-01" },
    { prompt_query: "best travel mug?", provider: "groq", model_name: "m1", retrieved_urls_json: ["https://example.com/a"], rendered_urls_json: [], extracted_urls_json: [], raw_answer: "Example is often recommended.", observed_at: "2026-01-02" },
  ], "example.com");
  assert.equal(result.tuples.length, 1);
  assert.equal(result.tuples[0].runs, 2);
  assert.equal(result.tuples[0].lowSampleWarning, true);
  const own = result.tuples[0].urls.find(item => item.url.includes("example.com"));
  const publisher = result.tuples[0].urls.find(item => item.url.includes("publisher.test"));
  assert.equal(own?.retrievedRuns, 2);
  assert.equal(own?.citationAuthority, true);
  assert.equal(publisher?.renderedRuns, 1);
  assert.equal(publisher?.domainInfluence, true);
  assert.equal(result.tuples[0].consistencyIndex, 100);
  assert.ok((own?.retrievalConfidence95.high ?? 0) <= 1);
});

test("retrieval consistency penalizes disjoint source sets across repeated checks", () => {
  const result = buildRetrievalConsistency([
    { prompt_query: "Question", provider: "p", model_name: "m", retrieved_urls_json: ["https://one.test/a"], observed_at: "2026-01-01" },
    { prompt_query: "Question", provider: "p", model_name: "m", retrieved_urls_json: ["https://two.test/b"], observed_at: "2026-01-02" },
  ], "example.com");
  assert.equal(result.tuples[0].consistencyIndex, 0);
});

test("referral to order matching uses only matching keyed journeys", () => {
  const result = summarizeProvenanceEvents([
    { event_type: "crawler_fetch", crawler_name: "GPTBot", crawler_verified: false, referral_host: null, occurred_at: "2026-01-01" },
    { event_type: "crawler_fetch", crawler_name: "GPTBot", crawler_verified: true, referral_host: null, occurred_at: "2026-01-01" },
    { event_type: "ai_referral", crawler_name: null, crawler_verified: false, referral_host: "chatgpt.com", journey_hash: "journey-a", occurred_at: "2026-01-01" },
    { event_type: "shopify_order", crawler_name: null, crawler_verified: false, referral_host: null, journey_hash: "journey-a", occurred_at: "2026-01-01" },
    { event_type: "shopify_order", crawler_name: null, crawler_verified: false, referral_host: null, journey_hash: "journey-b", occurred_at: "2026-01-01" },
  ]);
  assert.equal(result.claimedCrawlerFetches, 2);
  assert.equal(result.verifiedCrawlerFetches, 1);
  assert.equal(result.matchedReferralOrderJourneys, 1);
});
