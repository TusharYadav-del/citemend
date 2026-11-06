import test from "node:test";
import assert from "node:assert/strict";
import { detectCitationChanges } from "../lib/citation-change-detector";
import { buildOptInBenchmark, predictCitationDecay, wilsonConfidenceInterval } from "../lib/predictive-decay";

const observation = (id: string, urls: string[], observed_at: string, extra: Record<string, unknown> = {}) => ({ id, audit_id: `audit-${id}`, domain: "brand.test", prompt_query: "best analytics tool", model_name: "model-x", extracted_urls_json: urls, observed_at, ...extra });

test("citation detector records lost, gained, and a competitor source replacement for the same prompt/model", () => {
  const events = detectCitationChanges([
    observation("one", ["https://brand.test/guide"], "2026-01-01T00:00:00Z"),
    observation("two", ["https://competitor.test/review"], "2026-01-02T00:00:00Z"),
  ]);
  assert.deepEqual(events.map((event) => event.event_type), ["citation_gained", "citation_lost", "source_replaced"]);
  const replacement = events.find((event) => event.event_type === "source_replaced");
  assert.equal(replacement?.source_url, "https://brand.test/guide");
  assert.equal(replacement?.new_replacement_url, "https://competitor.test/review");
  assert.equal(replacement?.replaced_by_competitor, true);
});

test("citation events compare only within domain, prompt, and model tuples", () => {
  const events = detectCitationChanges([
    observation("one", ["https://brand.test/guide"], "2026-01-01T00:00:00Z"),
    { ...observation("two", ["https://other.test/guide"], "2026-01-02T00:00:00Z"), model_name: "other-model" },
  ]);
  assert.equal(events.length, 0);
});

test("url_broke requires recorded prior 200 and subsequent 404/410/timeout", () => {
  const valid = detectCitationChanges([
    observation("one", ["https://brand.test/guide"], "2026-01-01T00:00:00Z", { url_status_json: { "https://brand.test/guide": 200 } }),
    observation("two", ["https://brand.test/guide"], "2026-01-02T00:00:00Z", { url_status_json: { "https://brand.test/guide": 410 } }),
  ]);
  assert.equal(valid[0]?.event_type, "url_broke");
  const unknown = detectCitationChanges([
    observation("one", ["https://brand.test/guide"], "2026-01-01T00:00:00Z"),
    observation("two", ["https://brand.test/guide"], "2026-01-02T00:00:00Z", { url_status_json: { "https://brand.test/guide": 404 } }),
  ]);
  assert.equal(unknown.length, 0);
});

test("Wilson score interval for one success in one run is bounded and warns for low n", () => {
  const interval = wilsonConfidenceInterval(1, 1);
  assert.ok(interval.confidence_interval_low > 20 && interval.confidence_interval_low < 21);
  assert.equal(interval.confidence_interval_high, 100);
  assert.match(interval.sample_size_warning ?? "", /n < 5/);
  assert.equal(wilsonConfidenceInterval(4, 5).sample_size_warning, null);
});

test("confidence interval n uses the saved observation sample_size", () => {
  const result = predictCitationDecay({ url: "https://brand.test/guide", observations: [
    { urls: ["https://brand.test/guide"], observed_at: "2026-01-01", sample_size: 3 },
    { urls: [], observed_at: "2026-01-02", sample_size: 2 },
  ] });
  assert.equal(result.sample_size, 5);
  assert.equal(result.sample_size_warning, null);
});

test("citation decay reports stale content, declining frequency, and low sample warning", () => {
  const result = predictCitationDecay({ url: "https://brand.test/guide", now: Date.parse("2026-11-01T00:00:00Z"), observations: [
    { urls: ["https://brand.test/guide"], raw_answer: 'dateModified="2025-01-01"', observed_at: "2026-01-01" },
    { urls: ["https://brand.test/guide"], raw_answer: "", observed_at: "2026-01-02" },
    { urls: ["https://competitor.test/new"], raw_answer: 'dateModified="2026-10-01"', observed_at: "2026-01-03" },
  ] });
  assert.ok(result.decay_risk_score > 0);
  assert.equal(result.signals.declining_citation_frequency, true);
  assert.equal(result.signals.content_stale_over_180_days, true);
  assert.equal(result.signals.competitors_publish_fresher_pages, true);
  assert.match(result.sample_size_warning ?? "", /n < 5/);
});

test("benchmark stays hidden until five distinct workspaces opt in", () => {
  const four = [1, 2, 3, 4].map((n) => ({ workspaceKey: `workspace-${n}`, cited: 1, total: 2 }));
  assert.equal(buildOptInBenchmark(four), null);
  const benchmark = buildOptInBenchmark([...four, { workspaceKey: "workspace-5", cited: 0, total: 2 }]);
  assert.equal(benchmark?.contributing_workspaces, 5);
  assert.equal(benchmark?.citation_rate, 40);
  assert.equal("workspaceKey" in (benchmark as unknown as Record<string, unknown>), false);
});

test("category benchmark requires five opted-in workspaces within that category", () => {
  const rows = [1, 2, 3, 4].map((n) => ({ workspaceKey: `saas-${n}`, category: "b2b_saas", cited: 1, total: 1 }));
  rows.push({ workspaceKey: "shop-1", category: "ecommerce", cited: 1, total: 1 });
  assert.equal(buildOptInBenchmark(rows, "b2b_saas"), null);
  assert.equal(buildOptInBenchmark([...rows, { workspaceKey: "saas-5", category: "b2b_saas", cited: 0, total: 1 }], "b2b_saas")?.contributing_workspaces, 5);
});
