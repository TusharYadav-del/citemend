import assert from "node:assert/strict";
import { test } from "node:test";
import { ANNUAL_DISCOUNT_PERCENT, COMMERCIAL_TIERS, annualPrepay, contractPriceRange } from "../lib/billing";
import { exponentialRetryDelayMs, isRetryableJobStatus, normalizeIdempotencyKey, normalizeJobProgress } from "../lib/job-queue-core";
import { buildFounderRevenueSnapshot, currentFounderWeekStart, EMPTY_FOUNDER_SCORECARD, REVENUE_MILESTONES, validateFounderScorecard } from "../lib/founder-os";
import { estimateWorkspaceUnitEconomics, marginGuardrailAllows } from "../lib/unit-economics";

test("background queue helpers bound progress, retries, and idempotency keys", () => {
  assert.equal(normalizeJobProgress(-4), 0);
  assert.equal(normalizeJobProgress(100), 99);
  assert.equal(normalizeJobProgress(51.6), 52);
  assert.equal(exponentialRetryDelayMs(1), 15_000);
  assert.equal(exponentialRetryDelayMs(2), 30_000);
  assert.equal(exponentialRetryDelayMs(3), 60_000);
  assert.equal(exponentialRetryDelayMs(99), 3_600_000);
  assert.equal(isRetryableJobStatus("retrying"), true);
  assert.equal(isRetryableJobStatus("completed"), false);
  assert.equal(normalizeIdempotencyKey(" scan:42 ", "fallback"), "scan:42");
  assert.equal(normalizeIdempotencyKey("", "fallback"), "fallback");
  assert.throws(() => normalizeIdempotencyKey("bad\nkey", "fallback"), /printable/);
  assert.throws(() => normalizeIdempotencyKey("x".repeat(161), "fallback"), /160/);
});

test("monthly and annual prices cover all six published tiers with the two-month annual discount", () => {
  assert.equal(Object.keys(COMMERCIAL_TIERS).length, 6);
  assert.equal(ANNUAL_DISCOUNT_PERCENT, 16.67);
  assert.deepEqual(annualPrepay(39), { annualTotal: 390, effectiveMonthly: 32.5, discountPercent: 16.67 });
  for (const tier of Object.keys(COMMERCIAL_TIERS) as (keyof typeof COMMERCIAL_TIERS)[]) {
    assert.ok(contractPriceRange(tier, "USD", "monthly"));
    const annualUsd = contractPriceRange(tier, "USD", "annual");
    assert.equal(annualUsd.cadence, "annual");
    if (tier === "free_audit") {
      assert.equal(annualUsd.discountPercent, 0);
      assert.equal(annualUsd.marginFloorApplied, false);
    } else if (tier === "enterprise") {
      assert.equal(annualUsd.discountPercent, 0);
      assert.equal(annualUsd.marginFloorApplied, true);
      assert.ok(annualUsd.estimatedMonthlyDeliveryCostUsd !== null && annualUsd.min >= annualUsd.estimatedMonthlyDeliveryCostUsd * 48);
    } else {
      assert.equal(annualUsd.discountPercent, 16.67);
      assert.equal(annualUsd.marginFloorApplied, false);
    }
    const monthlyUsd = contractPriceRange(tier, "USD", "monthly");
    if (tier !== "free_audit" && monthlyUsd.estimatedMonthlyDeliveryCostUsd !== null) assert.ok(monthlyUsd.min >= monthlyUsd.estimatedMonthlyDeliveryCostUsd * 4);
    assert.ok(contractPriceRange(tier, "INR", "monthly"));
    assert.equal(contractPriceRange(tier, "INR", "annual").cadence, "annual");
  }
  assert.equal(contractPriceRange("enterprise", "INR", "annual").display, "Custom quote");
  assert.throws(() => annualPrepay(-1), /non-negative/);
});

test("workspace unit economics surfaces below-target margin estimates and a usage guardrail", (context) => {
  const names = ["CITEMEND_MODEL_COST_CHATGPT_SEARCH_USD_PER_CALL", "CITEMEND_MODEL_COST_PERPLEXITY_SONAR_USD_PER_CALL", "CITEMEND_MODEL_COST_GOOGLE_GEMINI_USD_PER_CALL", "CITEMEND_MODEL_COST_CLAUDE_USD_PER_CALL"];
  const old = new Map(names.map(name => [name, process.env[name]]));
  for (const name of names) process.env[name] = "0.001";
  context.after(() => { for (const [name, value] of old) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const estimate = estimateWorkspaceUnitEconomics({ workspaceMrrUsd: 30, monthlyAuditCount: 100, averagePromptCount: 1, infrastructureCostPerAuditUsd: 0.25 });
  assert.equal(estimate.estimate_only, true);
  assert.ok((estimate.estimated_gross_margin_percent ?? 100) < 75);
  assert.equal(estimate.gross_margin_warning, true);
  const allowed = marginGuardrailAllows({ workspaceMrrUsd: 100, completedAuditsThisMonth: 2, observedBuyerPromptCountThisMonth: 2, nextAuditPromptCount: 1, infrastructureCostPerAuditUsd: 0.25 });
  const denied = marginGuardrailAllows({ workspaceMrrUsd: 100, completedAuditsThisMonth: 400, observedBuyerPromptCountThisMonth: 400, nextAuditPromptCount: 1, infrastructureCostPerAuditUsd: 0.25 });
  assert.equal(allowed.allowed, true);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "gross_margin_guardrail");
});

test("founder scorecard, UTC week, MRR estimates, and roadmap milestones are explicit", () => {
  assert.equal(currentFounderWeekStart(new Date("2026-11-04T18:30:00.000Z")), "2026-11-02");
  assert.deepEqual(validateFounderScorecard(EMPTY_FOUNDER_SCORECARD), EMPTY_FOUNDER_SCORECARD);
  assert.throws(() => validateFounderScorecard({ ...EMPTY_FOUNDER_SCORECARD, product_demos: -1 }), /whole-number/);
  const revenue = buildFounderRevenueSnapshot([
    { user_id: "u1", plan: "pro", status: "active", cancelled: false },
    { user_id: "u2", plan: "agency", status: "active", cancelled: false },
    { user_id: "u3", plan: "enterprise", status: "active", cancelled: false },
  ], [
    { user_id: "u1", domain: "saas.example", segment: "b2b_saas" },
    { user_id: "u2", domain: "agency.example", segment: "agency" },
  ]);
  assert.equal(revenue.planPricedEstimatedMrrUsd, 288);
  assert.equal(revenue.planPricedEstimatedArrUsd, 3456);
  assert.equal(revenue.unpricedActiveSubscriptions, 1);
  assert.equal(revenue.segmentMixEstimatedMrrUsd.b2b_saas, 39);
  assert.equal(revenue.segmentMixEstimatedMrrUsd.agency, 249);
  assert.deepEqual(REVENUE_MILESTONES.map(item => item.targetMrrUsd), [1000, 10000, 84000]);
  assert.match(revenue.measurementNote, /not a finance ledger/);
});
