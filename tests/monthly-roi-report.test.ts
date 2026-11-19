import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMonthlyRoiMetrics, currentReportMonth, parseReportMonth, summarizeMonthlyProvenance } from "../lib/monthly-roi-report";

test("calendar report month uses a half-open UTC interval and rejects future or malformed months", () => {
  const month = parseReportMonth("2026-02", new Date("2026-11-18T12:00:00.000Z"));
  assert.deepEqual(month, { value: "2026-02", label: "February 2026", start: "2026-02-01T00:00:00.000Z", end: "2026-03-01T00:00:00.000Z" });
  assert.equal(parseReportMonth("2026-12", new Date("2026-11-18T12:00:00.000Z")), null);
  assert.equal(parseReportMonth("2026-13"), null);
  assert.equal(parseReportMonth("2026-2"), null);
  assert.equal(currentReportMonth(new Date("2027-01-02T00:00:00.000Z")).value, "2027-01");
});

test("monthly provenance separates retrieved URLs from rendered owned links and third-party sources", () => {
  assert.deepEqual(summarizeMonthlyProvenance([
    { retrieved_urls_json: ["https://shop.example/guide", "https://shop.example/guide#part", "https://publisher.example/review"], rendered_urls_json: ["https://shop.example/guide", "https://publisher.example/review", "javascript:alert(1)"] },
    { retrieved_urls_json: [], rendered_urls_json: ["https://blog.shop.example/story"] },
  ], "shop.example"), { observationCount: 2, retrievedUrls: 2, renderedUrls: 3, ownedRenderedUrls: 2, thirdPartyRenderedUrls: 1 });
});

test("monthly ROI metrics count recovery, prevented redirects, visits, and disclosed time estimates", () => {
  const metrics = calculateMonthlyRoiMetrics([
    { finding_type: "dead_url", approval_status: "pending_human_review", guardrail_classification: "recoverable_equivalent" },
    { finding_type: "dead_url", approval_status: "approved", guardrail_classification: "recoverable_equivalent" },
    { finding_type: "dead_url", approval_status: "rejected_bad_recommendation", guardrail_classification: "leave_as_404_or_410" },
    { finding_type: "price_mismatch", approval_status: "deployed", guardrail_classification: "recoverable_equivalent" },
  ], 12);
  assert.deepEqual(metrics, { highIntentErrors: 2, recoveredVisits: 12, preventedRecommendations: 1, estimatedHoursSaved: 0.75 });
  assert.equal(calculateMonthlyRoiMetrics([], null).recoveredVisits, null);
});
