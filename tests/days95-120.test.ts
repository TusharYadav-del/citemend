import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeObservation, nextObservationJobState } from "../lib/evidence-engine";
import { assessTechnicalDeployment, observationCitesCanonical, outcomeMilestones } from "../lib/outcome-verifier";
import { buildBeforeAfterReport } from "../lib/before-after-report";
import { getOnboardingProgress, AUDIT_TEMPLATES } from "../lib/onboarding";
import { exportRedirectRecords, parseRedirectImport, generateWorkspaceApiKey, verifyWorkspaceApiKey, withinTierQuota, webhookEventIdentity } from "../lib/integrations-workflow";
import { extractPageEntity, comparePageEntities } from "../lib/entity-consistency";
import { classifyCitationForensics, compareCitationPageFacts, measureBuyerPromptCoverage, type ForensicInput } from "../lib/citation-forensics";
import { buildIntelligenceGraph, buildIntelligenceTimeline } from "../lib/intelligence-graph";
import { planTier } from "../lib/audit-quota";

test("observation evidence normalization is reproducible, bounded and records job state", () => {
  const row = normalizeObservation({ audit_id: "audit-1", domain: "Example.com", prompt_query: "  best tools  ", provider: " Groq ", model_name: "model", search_method: "search", raw_answer: "answer", extracted_urls: ["https://example.com/a", "https://example.com/a"], job_status: "failed", retry_count: 2, error_message: "retry me", observed_at: "2026-01-01T00:00:00.000Z" });
  assert.equal(row.domain, "example.com"); assert.equal(row.prompt_query, "best tools"); assert.deepEqual(row.extracted_urls_json, ["https://example.com/a"]); assert.equal(row.locale, "en-US"); assert.equal(row.job_status, "failed"); assert.equal(row.retry_count, 2); assert.equal(row.observed_at, "2026-01-01T00:00:00.000Z");
  assert.throws(() => normalizeObservation({ audit_id: "a", domain: "x", prompt_query: "p", provider: "p", model_name: "m", search_method: "s", raw_answer: "", extracted_urls: [], observation_confidence: 101 }), /between 0 and 100/);
  assert.deepEqual(nextObservationJobState("failed", "queued", 2), { job_status: "queued", retry_count: 3 });
  assert.throws(() => nextObservationJobState("failed", "queued", 5), /retry limit/);
});

test("technical deployment and subsequent AI citation remain separate milestones", () => {
  assert.equal(assessTechnicalDeployment({ approved: true, source404: true, destinationStatus: 200, sameDomain: true, noLoop: true, noConflict: true }), true);
  assert.equal(assessTechnicalDeployment({ approved: true, source404: true, destinationStatus: 200, sameDomain: true, noLoop: true, noConflict: true }), true);
  const verifiedAt = "2026-01-01T00:00:00.000Z";
  assert.equal(observationCitesCanonical({ technicalVerified: true, technicalVerifiedAt: verifiedAt, observationAt: "2026-01-02T00:00:00.000Z", canonicalUrl: "https://example.com/new", extractedUrls: ["https://example.com/new#faq"] }), true);
  assert.equal(observationCitesCanonical({ technicalVerified: true, technicalVerifiedAt: verifiedAt, observationAt: verifiedAt, canonicalUrl: "https://example.com/new", extractedUrls: ["https://example.com/new"] }), false);
  assert.deepEqual(outcomeMilestones({ technicalVerifiedAt: verifiedAt }), { technical_deployment_verified: true, ai_citation_observed: false, technical_verified_at: verifiedAt, ai_citation_observed_at: null });
});

test("before and after report shows citation, claim and URL-state deltas", () => {
  const report = buildBeforeAfterReport({ observedAt: "2026-01-01T00:00:00Z", brokenUrl: "https://example.com/old", citedUrls: ["https://example.com/old"], claims: ["Old price"], urlState: "404" }, { observedAt: "2026-01-03T00:00:00Z", citedUrls: ["https://example.com/new"], canonicalUrl: "https://example.com/new", claims: ["Current price"], urlState: "200" });
  assert.deepEqual(report.addedCitations, ["https://example.com/new"]); assert.deepEqual(report.claimsRemoved, ["Old price"]); assert.equal(report.canonicalDestinationObserved, true); assert.equal(report.technicalStateChanged, true); assert.equal(report.elapsedMs, 172800000);
});

test("entity extraction and comparison flag repeated plan price conflict with observable evidence", () => {
  const homepage = extractPageEntity("homepage", "https://acme.test/", "<title>Acme</title><h2>Growth</h2><p>Growth plan $49/mo</p><link rel='canonical' href='https://acme.test/'><script type='application/ld+json'>{\"@type\":\"SoftwareApplication\"}</script>");
  const pricing = extractPageEntity("pricing", "https://acme.test/pricing", "<h2>Growth</h2><p>Growth plan $79/mo</p><link rel='canonical' href='https://other.test/pricing'>");
  const result = comparePageEntities([homepage, pricing], "Growth costs $99/mo");
  assert.ok(result.conflicts.some(item => item.kind === "price_conflict")); assert.ok(result.conflicts.some(item => item.kind === "canonical_mismatch")); assert.ok(result.conflicts.some(item => item.kind === "ai_price_difference")); assert.ok(result.fixes.every(item => item.html.includes("canonical")));
  assert.match(result.guidance, /do not guarantee/);
});

test("onboarding advances only when each saved evidence milestone exists", () => {
  assert.deepEqual(getOnboardingProgress({ ownedDomains: 0, savedAudit: false, approvedRecovery: false, technicalDeploymentVerified: false }), { domainConnected: false, firstAudit: false, recoveryApproved: false, resultVerified: false });
  assert.deepEqual(getOnboardingProgress({ ownedDomains: 1, savedAudit: true, approvedRecovery: true, technicalDeploymentVerified: true }), { domainConnected: true, firstAudit: true, recoveryApproved: true, resultVerified: true });
  assert.equal(AUDIT_TEMPLATES["B2B SaaS Buyer-Intent Template"].length, 5); assert.equal(AUDIT_TEMPLATES["Multi-Client Agency Pitch Template"].length, 5);
});

test("bulk redirect interchange, API key hashing and tier quotas", () => {
  const rows = [{ broken_url: "https://acme.test/old", destination_url: "https://acme.test/new", url_state: "404", approval_status: "pending_review" }];
  assert.deepEqual(parseRedirectImport(exportRedirectRecords(rows, "json"), "json"), rows);
  assert.deepEqual(parseRedirectImport(exportRedirectRecords(rows, "csv"), "csv"), rows);
  const generated = generateWorkspaceApiKey(); assert.equal(verifyWorkspaceApiKey(generated.key, generated.hash), true); assert.equal(verifyWorkspaceApiKey(generated.key + "x", generated.hash), false);
  assert.equal(withinTierQuota("free_audit", { audits: 1, pages: 10, modelCalls: 3 }), true); assert.equal(withinTierQuota("free_audit", { audits: 2, pages: 10, modelCalls: 3 }), false);
  assert.equal(withinTierQuota("starter", { audits: 1, pages: 101, modelCalls: 1 }), false); assert.equal(withinTierQuota("growth", { audits: 1, pages: 1, modelCalls: 301 }), false); assert.equal(planTier("agency", true), "agency"); assert.equal(planTier(null, false), "free_audit");
  assert.equal(webhookEventIdentity("lemon_squeezy", "evt_123"), "lemon_squeezy:evt_123");
});

test("all forensic issue types keep observable evidence distinct from hypotheses", () => {
  const input: ForensicInput = { targetUrl: "https://acme.test/old", targetStatus: 404, inSitemap: false, robotsAllows: false, intentSimilarity: 0.2, targetHasStructuredProof: false, citedThirdPartyHasStructuredProof: true, targetUpdatedAt: "2020-01-01T00:00:00Z", citedStatus: 410, observedCitationUrl: null };
  const findings = classifyCitationForensics(input); const kinds = new Set(findings.map(item => item.kind));
  for (const kind of ["discoverability", "retrieval", "citation_selection", "stale_content", "broken_destination"] as const) assert.ok(kinds.has(kind));
  for (const finding of findings) { assert.ok(finding.observableEvidence.length > 0); assert.ok(finding.diagnosticHypotheses.length > 0); assert.ok(!finding.observableEvidence.some(value => /caused|private weights|reasoning/i.test(value))); }
  assert.match(findings.find(item => item.kind === "retrieval")?.observableEvidence.join(" ") ?? "", /word-overlap measure, not semantic similarity/);
  assert.equal(measureBuyerPromptCoverage("best CRM for startups", "CRM", ["A customer relationship management platform for startups"]), 1);
  const facts = compareCitationPageFacts({ prices: ["$49/mo"], featureClaims: ["Built for small teams"], jsonLd: [], updatedAt: "2020-01-01" }, { prices: ["$79/mo"], featureClaims: ["Built for large teams"], jsonLd: ["Offer"], updatedAt: "2026-01-01" });
  assert.deepEqual(facts.targetPricesNotSeenOnCitedPage, ["$49/mo"]); assert.deepEqual(facts.citedClaimsNotSeenOnTarget, ["Built for large teams"]); assert.equal(facts.citedStructuredDataCount, 1);
});

test("nine-object graph builds a chronological evidence timeline", () => {
  const timeline = buildIntelligenceTimeline({ domain: "acme.test", prompt: "best crm", observations: [{ id: "obs-1", domain: "acme.test", prompt_query: "best crm", provider: "Groq", model_name: "model", extracted_urls_json: ["https://publisher.test/review"], observed_at: "2026-01-01T00:00:00Z" }, { id: "obs-2", domain: "acme.test", prompt_query: "best crm", provider: "Groq", model_name: "model", extracted_urls_json: ["https://acme.test/guide"], observed_at: "2026-01-03T00:00:00Z" }], opportunities: [{ id: "opp-1", opportunity_type: "competitor replacement", prompt_query: "best crm", created_at: "2026-01-01T12:00:00Z", stage_history_json: [{ stage: "reviewed", at: "2026-01-02T00:00:00Z", actor_user_id: "user-1", note: "approved source replacement" }] }], actions: [{ id: "act-1", action_type: "redirect_approval", created_at: "2026-01-02T00:00:00Z" }], outcomes: [{ id: "out-1", technical_deployment_verified_at: "2026-01-03T00:00:00Z" }] });
  assert.deepEqual(new Set(timeline.map(item => item.type)), new Set(["Brand", "Prompt", "Model", "Observation", "Publisher", "URL", "Evidence", "Action", "Outcome"]));
  assert.deepEqual([...timeline].sort((a, b) => a.at.localeCompare(b.at) || a.type.localeCompare(b.type)), timeline);
  assert.ok(timeline.some(item => item.label.includes("Citation disappeared: https://publisher.test/review")));
  assert.ok(timeline.some(item => item.label.includes("Citation appeared: https://acme.test/guide")));
  assert.ok(timeline.some(item => item.label.includes("Opportunity reviewed: approved source replacement")));
  const graph = buildIntelligenceGraph({ domain: "acme.test", prompt: "best crm", observations: [{ id: "obs-1", prompt_query: "best crm", model_name: "model", extracted_urls_json: ["https://publisher.test/review"], observed_at: "2026-01-01T00:00:00Z" }, { id: "obs-2", prompt_query: "best crm", model_name: "model", extracted_urls_json: ["https://acme.test/guide"], observed_at: "2026-01-03T00:00:00Z" }], opportunities: [{ id: "opp", prompt_query: "best crm", stage_history_json: [{ stage: "reviewed", at: "2026-01-02T00:00:00Z", actor_user_id: "user-1", note: "reviewed" }] }], actions: [{ id: "act", action_type: "approve" }], outcomes: [{ id: "out", technical_deployment_verified_at: "2026-01-03T00:00:00Z" }] });
  assert.ok(graph.edges.some(edge => edge.relation === "cites")); assert.ok(graph.edges.some(edge => edge.relation === "resulted_in")); assert.ok(graph.edges.some(edge => edge.relation === "disappeared")); assert.ok(graph.edges.some(edge => edge.relation === "replaced")); assert.ok(graph.edges.some(edge => edge.from === "Action:opp" && edge.to.startsWith("Action:opp:reviewed:")));
});
