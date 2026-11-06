import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVerifiedCaseStudy, type CaseStudyInput } from "../lib/case-study-builder";

const input: CaseStudyInput = {
  anonymize: true,
  audit: { id: "audit-1", domain: "example.com", createdAt: "2026-01-01T00:00:00.000Z", buyerPrompt: "best support platform" },
  brokenLinks: [{ id: "link-1", citedUrl: "https://example.com/old-guide", httpStatus: 404, urlState: "404" }],
  outcomes: [{ brokenLinkId: "link-1", canonicalDestinationUrl: "https://example.com/support", technicalDeploymentVerifiedAt: "2026-01-01T00:20:00.000Z", aiCitationObservedAt: "2026-01-02T00:00:00.000Z", evidenceId: "obs-2" }],
  observations: [{ id: "obs-2", provider: "groq", modelName: "modeled-search", observedAt: "2026-01-02T00:00:00.000Z", extractedUrls: ["https://example.com/support"] }],
  actions: [{ actionType: "redirect_approved", targetUrl: "https://example.com/support", createdAt: "2026-01-01T00:10:00.000Z" }],
};

test("verified case study separates technical recovery from later citation and anonymizes customer details", () => {
  const study = buildVerifiedCaseStudy(input);
  assert.equal(study.verifiedOutcome.technicalDeploymentVerified, true);
  assert.equal(study.verifiedOutcome.laterAiCitationObserved, true);
  assert.equal(study.timeToRecoveryMinutes, 20);
  assert.equal(study.recoveryAction.kind, "301_redirect");
  assert.equal(study.baselineProblem.sourceUrl, "[customer URL redacted]");
  assert.equal(study.recoveryAction.destinationUrl, "[customer URL redacted]");
  assert.equal(study.workspaceLabel, "A customer workspace");
  assert.equal(study.buyerPrompt, null);
  assert.equal(study.verifiedOutcome.estimatedPipelineUsd, null);
  assert.match(study.verifiedOutcome.estimateDisclosure, /no estimate/i);
  assert.ok(study.observableEvidence.some((item) => item.includes("later saved AI observation")));
});

test("case study may use only measured rescued visits and labels any pipeline estimate as an assumption", () => {
  const study = buildVerifiedCaseStudy({ ...input, outcomes: [], rescuedVisits: [{ rescuedTargetUrl: "https://example.com/recovered", createdAt: "2026-01-01T00:12:00.000Z" }], estimatedPipelineValuePerVisitUsd: 15 });
  assert.equal(study.verifiedOutcome.technicalDeploymentVerified, false);
  assert.equal(study.verifiedOutcome.laterAiCitationObserved, false);
  assert.equal(study.verifiedOutcome.measuredRescuedAiVisits, 1);
  assert.equal(study.verifiedOutcome.estimatedPipelineUsd, 15);
  assert.equal(study.verifiedOutcome.assumedPipelineValuePerVisitUsd, 15);
  assert.match(study.verifiedOutcome.estimateDisclosure, /not revenue or realized sales/i);
});

test("case study rejects a technical action without a later citation or measured rescued visit", () => {
  assert.throws(() => buildVerifiedCaseStudy({ ...input, outcomes: [{ ...input.outcomes[0], aiCitationObservedAt: null }], rescuedVisits: [] }), /requires a technical deployment plus later AI citation/i);
  assert.throws(() => buildVerifiedCaseStudy({ ...input, outcomes: [], rescuedVisits: [] }), /requires a technical deployment plus later AI citation/i);
});
