import assert from "node:assert/strict";
import { test } from "node:test";
import { groupRecoverySignals, normalizeRecoveryUrl } from "../lib/recovery/normalize";
import { evaluateRecoveryCandidate, hasCommercialTopicEquivalence } from "../lib/recovery/guardrails";

test("normalization strips tracking parameters, casing and trailing slash variants", () => {
  assert.deepEqual(normalizeRecoveryUrl("https://Store.com/Products/Old-Shoe/?utm_source=x&fbclid=y&size=8"), {
    normalized_path: "/products/old-shoe",
    normalized_url: "https://store.com/products/old-shoe?size=8",
  });
  const groups = groupRecoverySignals([
    { url: "https://store.com/PRODUCTS/Old-Shoe/?utm_campaign=x", observed404Visits: 8, externalReferrers: 1 },
    { url: "https://store.com/products/old-shoe?gclid=y", kind: "citation", citationSnapshots: 3 },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].variants.length, 2);
  assert.equal(groups[0].observed_404_visits, 8);
  assert.equal(groups[0].external_referrers, 1);
  assert.equal(groups[0].citation_snapshots, 3);
  assert.ok(groups[0].priority_score > 0);
});

test("blocks deep URL to homepage soft-404 suggestions", () => {
  const result = evaluateRecoveryCandidate({ deadUrl: "https://store.com/products/discontinued-shoe", suggestedTargetUrl: "https://store.com/", sourceStatus: 404, targetStatus: 200, confidenceScore: 99, semanticEquivalent: true, commerciallyEquivalent: true });
  assert.equal(result.classification, "leave_as_404_or_410");
  assert.equal(result.rejected_soft_404, true);
});

test("blocks self loops, known redirect chains, multi-hop chains, and non-200 destinations", () => {
  const base = { deadUrl: "https://store.com/products/a", sourceStatus: 404, targetStatus: 200, confidenceScore: 90, semanticEquivalent: true, commerciallyEquivalent: true };
  assert.equal(evaluateRecoveryCandidate({ ...base, suggestedTargetUrl: "https://store.com/products/a" }).classification, "chain_or_loop_risk");
  assert.equal(evaluateRecoveryCandidate({ ...base, suggestedTargetUrl: "https://store.com/products/b", knownRedirectUrls: ["https://store.com/products/b"] }).classification, "chain_or_loop_risk");
  assert.equal(evaluateRecoveryCandidate({ ...base, suggestedTargetUrl: "https://store.com/products/b", redirectHops: 2 }).classification, "chain_or_loop_risk");
  assert.equal(evaluateRecoveryCandidate({ ...base, suggestedTargetUrl: "https://store.com/products/b", targetStatus: 301 }).classification, "chain_or_loop_risk");
});

test("accepts a high-confidence equivalent product replacement while retaining human approval", () => {
  const result = evaluateRecoveryCandidate({ deadUrl: "https://store.com/products/old-shoe", suggestedTargetUrl: "https://store.com/products/current-shoe", sourceStatus: 404, targetStatus: 200, confidenceScore: 88, semanticEquivalent: true, commerciallyEquivalent: true });
  assert.equal(result.classification, "recoverable_equivalent");
  assert.equal(result.confidence_score, 88);
  assert.match(result.match_reason, /human approval/i);
});

test("commercial equivalence rejects unrelated paths even when neither uses a commerce prefix", () => {
  assert.equal(hasCommercialTopicEquivalence("https://store.com/docs/install", "https://store.com/about/company"), false);
  assert.equal(hasCommercialTopicEquivalence("https://store.com/products/old-running-shoe", "https://store.com/products/current-running-shoe"), true);
});
