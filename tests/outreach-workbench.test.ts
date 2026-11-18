import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canFounderApproveDraft,
  DELIVERABILITY_CHECKS,
  EMPTY_DELIVERABILITY_CHECKLIST,
  isDeliverabilityReady,
  isReviewableOneExample,
  normalizeSendingDomain,
  normalizeSuppressionEmail,
  parseDeliverabilityChecklist,
} from "../lib/outreach/workbench";

const complete = Object.fromEntries(DELIVERABILITY_CHECKS.map(({ key }) => [key, true]));
const factualityReport = { passed: true, claims: [{ deadUrl: "https://shop.example/products/old", status: 404, detectedAt: "2026-11-18T00:00:00.000Z", referrerUrl: "https://publisher.example/review", referrerContext: "Old item is cited.", replacementUrl: "https://shop.example/products/current", replacementReason: "Same product family; destination returned HTTP 200." }] };

test("sending-domain and suppression inputs normalize safely and reject unsafe hosts", () => {
  assert.equal(normalizeSendingDomain(" Mail.Example.com. "), "mail.example.com");
  assert.equal(normalizeSendingDomain("localhost"), null);
  assert.equal(normalizeSendingDomain("127.0.0.1"), null);
  assert.equal(normalizeSendingDomain("https://mail.example.com"), null);
  assert.equal(normalizeSuppressionEmail("Person@Example.com"), "person@example.com");
  assert.equal(normalizeSuppressionEmail("not-an-email"), null);
});

test("deliverability checklist requires exactly known boolean checks", () => {
  assert.equal(isDeliverabilityReady(EMPTY_DELIVERABILITY_CHECKLIST), false);
  assert.equal(isDeliverabilityReady(complete), true);
  assert.deepEqual(parseDeliverabilityChecklist({ ...complete, injected: true }), null);
  assert.equal(parseDeliverabilityChecklist({ ...complete, dkim_verified: "yes" }), null);
});

test("founder approval requires the env gate, all checklist checks, an unsuppressed locked draft, and exactly one valid example", () => {
  assert.equal(isReviewableOneExample(factualityReport), true);
  const ready = { outboundEnabled: true, sendingDomain: "mail.citemend.com", checklist: complete, status: "draft_locked", suppressed: false, factualityReport };
  assert.equal(canFounderApproveDraft(ready), true);
  assert.equal(canFounderApproveDraft({ ...ready, outboundEnabled: false }), false);
  assert.equal(canFounderApproveDraft({ ...ready, sendingDomain: null }), false);
  assert.equal(canFounderApproveDraft({ ...ready, checklist: EMPTY_DELIVERABILITY_CHECKLIST }), false);
  assert.equal(canFounderApproveDraft({ ...ready, suppressed: true }), false);
  assert.equal(canFounderApproveDraft({ ...ready, status: "draft" }), false);
  assert.equal(isReviewableOneExample({ ...factualityReport, claims: [] }), false);
  assert.equal(isReviewableOneExample({ ...factualityReport, claims: [factualityReport.claims[0], factualityReport.claims[0]] }), false);
});
