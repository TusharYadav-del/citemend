import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyEvidenceCategory, EVIDENCE_CATEGORY_LABELS } from "../lib/evidence-categories";

test("evidence badges distinguish verified HTTP, provider observations, and estimates", () => {
  assert.equal(classifyEvidenceCategory({ httpStatus: 404 }), "http");
  assert.equal(classifyEvidenceCategory({ provider: "Peec AI", model: "customer report", observedAt: "2026-11-07T00:00:00Z" }), "observation");
  assert.equal(classifyEvidenceCategory({ simulated: true, provider: "Groq", model: "simulated" }), "estimate");
  assert.equal(classifyEvidenceCategory({ provider: "", model: "", observedAt: null }), "estimate");
  assert.deepEqual(Object.values(EVIDENCE_CATEGORY_LABELS), ["Verified HTTP & Destination Check", "Recorded Platform / Provider Observation", "Heuristic / Simulation Estimate"]);
});
