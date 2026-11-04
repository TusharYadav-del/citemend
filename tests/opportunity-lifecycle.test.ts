import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceOpportunityStage, appendStageEvent, compositePriorityScore, OPPORTUNITY_STAGES, rankOpportunityEvidence } from "../lib/opportunity-lifecycle";

test("scores four bounded opportunity signals with equal transparent weights", () => {
  assert.equal(compositePriorityScore({ relevance_score: 100, buyer_intent_score: 80, citation_evidence_score: 60, replacement_quality_score: 40 }), 70);
  assert.deepEqual(rankOpportunityEvidence({ opportunity_type: "competitor_direct_404", prompt_query: "best project tool pricing", http_status: 404, similarity_score: 0.8, matched_user_live_url: "https://acme.test/features" }), {
    relevance_score: 80, buyer_intent_score: 85, citation_evidence_score: 95, replacement_quality_score: 92, composite_priority_score: 88,
  });
  assert.throws(() => compositePriorityScore({ relevance_score: 101, buyer_intent_score: 1, citation_evidence_score: 1, replacement_quality_score: 1 }), RangeError);
});

test("only advances one of the six CRM lifecycle stages at a time", () => {
  assert.equal(OPPORTUNITY_STAGES.length, 6);
  assert.equal(advanceOpportunityStage("discovered", "reviewed"), true);
  assert.equal(advanceOpportunityStage("discovered", "contacted"), false);
  assert.equal(advanceOpportunityStage("link_updated", "replied"), false);
  assert.equal(advanceOpportunityStage("ai_citation_observed", "ai_citation_observed"), false);
});

test("appends timestamped CRM events without dropping earlier notes", () => {
  const first = { stage: "reviewed" as const, at: "2026-11-05T00:00:00.000Z", actor_user_id: "user-1", note: "Verified source" };
  const second = { stage: "contacted" as const, at: "2026-11-06T00:00:00.000Z", actor_user_id: "user-1", note: "Human sent a draft" };
  assert.deepEqual(appendStageEvent(appendStageEvent([], first), second), [first, second]);
  assert.throws(() => appendStageEvent({}, first), TypeError);
});
