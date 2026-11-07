import test from "node:test";
import assert from "node:assert/strict";
import { calculateWorkspaceOperatingMetrics, validFounderMetricsAuthorization } from "../lib/operating-metrics";
import { DEFAULT_MODEL_COST_USD_PER_CALL, estimateAuditModelCostUsd, getModelRegistry } from "../lib/model-registry";

test("operating metrics measure first completed audit, first recovery, verified deploys, and complete evidence", () => {
  const evidence = new Map([[
    "evidence-1",
    { id: "evidence-1", prompt_query: "best service", prompt_version: "v1", provider: "groq", model_name: "model-a", search_method: "probe", locale: "en-US", raw_answer: "Answer with source.", extracted_urls_json: ["https://brand.test/page"], sample_size: 1, observed_at: "2026-11-06T10:14:00Z" },
  ]]);
  const metrics = calculateWorkspaceOperatingMetrics({
    workspaceCreatedAt: "2026-11-06T10:00:00Z",
    audits: [{ id: "audit-1", status: "completed", created_at: "2026-11-06T10:14:00Z", completed_at: "2026-11-06T10:14:00Z" }],
    recoveryActions: [{ approved_at: "2026-11-06T10:30:00Z" }],
    deploymentActions: [{ target_url: "https://brand.test/new" }, { target_url: "https://brand.test/missing-verification" }],
    outcomes: [{ id: "outcome-1", canonical_destination_url: "https://brand.test/new", technical_deployment_verified_at: "2026-11-06T10:35:00Z", evidence_id: "evidence-1" }],
    evidenceById: evidence,
    tier: "pro",
    monthlyPriceUsd: 39,
    monthlyAuditCount: 1,
    averagePromptCount: 1,
  });
  assert.equal(metrics.time_to_first_useful_audit_minutes, 14);
  assert.equal(metrics.time_to_first_useful_audit_target_met, true);
  assert.equal(metrics.time_to_first_recovery_action_minutes, 16);
  assert.equal(metrics.redirect_deployment_verification_rate_percent, 50);
  assert.equal(metrics.evidence_completeness_rate_percent, 100);
  assert.equal(metrics.customer_activation.activated, true);
  assert.equal(metrics.gross_margin_estimate.cost_estimate_only, true);
});

test("legacy workspace baselines do not invent first-audit timing", () => {
  const metrics = calculateWorkspaceOperatingMetrics({ workspaceCreatedAt: null, audits: [{ status: "completed", created_at: "2026-11-06T10:00:00Z", completed_at: null }], recoveryActions: [], deploymentActions: [], outcomes: [], evidenceById: new Map(), tier: "free", monthlyPriceUsd: 0, monthlyAuditCount: 0, averagePromptCount: 1 });
  assert.equal(metrics.time_to_first_useful_audit_minutes, null);
  assert.equal(metrics.time_to_first_recovery_action_minutes, null);
  assert.equal(metrics.customer_activation.activated, true);
  assert.equal(metrics.first_useful_audit_at, null);
});

test("first recovery timing only counts actions approved after the first completed audit", () => {
  const metrics = calculateWorkspaceOperatingMetrics({
    workspaceCreatedAt: "2026-11-06T10:00:00Z",
    audits: [{ status: "completed", created_at: "2026-11-06T10:10:00Z", completed_at: "2026-11-06T10:20:00Z" }],
    recoveryActions: [{ approved_at: "2026-11-06T10:15:00Z" }, { approved_at: "2026-11-06T10:35:00Z" }],
    deploymentActions: [], outcomes: [], evidenceById: new Map(), tier: "free", monthlyPriceUsd: 0, monthlyAuditCount: 0, averagePromptCount: 1,
  });
  assert.equal(metrics.first_recovery_action_at, "2026-11-06T10:35:00Z");
  assert.equal(metrics.time_to_first_recovery_action_minutes, 15);
});

test("model registry supports per-profile version, timeout, and estimated invocation cost overrides", (context) => {
  const names = ["GROQ_MODEL", "CITEMEND_PERPLEXITY_PROFILE_MODEL", "CITEMEND_GOOGLE_GEMINI_MODEL", "CITEMEND_GOOGLE_GEMINI_FALLBACK_MODEL", "CITEMEND_CLAUDE_PROFILE_MODEL", "CITEMEND_CHATGPT_SEARCH_TIMEOUT_MS", "CITEMEND_MODEL_COST_CHATGPT_SEARCH_USD_PER_CALL", "CITEMEND_MODEL_COST_PERPLEXITY_SONAR_USD_PER_CALL", "CITEMEND_MODEL_COST_GOOGLE_GEMINI_USD_PER_CALL", "CITEMEND_MODEL_COST_CLAUDE_USD_PER_CALL"];
  const old = new Map(names.map((name) => [name, process.env[name]]));
  context.after(() => { for (const [name, value] of old) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  process.env.GROQ_MODEL = "openai/test-model";
  process.env.CITEMEND_PERPLEXITY_PROFILE_MODEL = "openai/perplexity-profile-v2";
  process.env.CITEMEND_GOOGLE_GEMINI_MODEL = "gemini-test-v4";
  process.env.CITEMEND_CLAUDE_PROFILE_MODEL = "openai/claude-profile-v2";
  process.env.CITEMEND_CHATGPT_SEARCH_TIMEOUT_MS = "30000";
  process.env.CITEMEND_MODEL_COST_CHATGPT_SEARCH_USD_PER_CALL = "0.001";
  process.env.CITEMEND_MODEL_COST_PERPLEXITY_SONAR_USD_PER_CALL = "0.002";
  process.env.CITEMEND_MODEL_COST_GOOGLE_GEMINI_USD_PER_CALL = "0.003";
  process.env.CITEMEND_MODEL_COST_CLAUDE_USD_PER_CALL = "0.004";
  const registry = getModelRegistry();
  assert.equal(registry.chatgpt_search.model, "openai/test-model");
  assert.equal(registry.perplexity_sonar.model, "openai/perplexity-profile-v2");
  assert.equal(registry.google_gemini.model, "gemini-test-v4");
  assert.equal(registry.claude.model, "openai/claude-profile-v2");
  assert.equal(registry.chatgpt_search.timeoutMs, 30000);
  assert.equal(registry.claude.profileKind, "synthesis_simulation");
  assert.deepEqual(estimateAuditModelCostUsd(2), { estimatedCostUsd: 0.02, promptCount: 2, assumedModelCallsPerPrompt: 4, missingCostModels: [], estimateOnly: true });
});

test("model registry enables gross-margin estimates with conservative defaults when no overrides exist", (context) => {
  const names = ["CITEMEND_MODEL_COST_CHATGPT_SEARCH_USD_PER_CALL", "CITEMEND_MODEL_COST_PERPLEXITY_SONAR_USD_PER_CALL", "CITEMEND_MODEL_COST_GOOGLE_GEMINI_USD_PER_CALL", "CITEMEND_MODEL_COST_CLAUDE_USD_PER_CALL"];
  const old = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  context.after(() => { for (const [name, value] of old) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const registry = getModelRegistry();
  assert.equal(registry.chatgpt_search.estimatedCostUsdPerCall, DEFAULT_MODEL_COST_USD_PER_CALL.chatgpt_search);
  assert.equal(registry.perplexity_sonar.estimatedCostUsdPerCall, DEFAULT_MODEL_COST_USD_PER_CALL.perplexity_sonar);
  assert.equal(registry.google_gemini.estimatedCostUsdPerCall, DEFAULT_MODEL_COST_USD_PER_CALL.google_gemini);
  assert.equal(registry.claude.estimatedCostUsdPerCall, DEFAULT_MODEL_COST_USD_PER_CALL.claude);
  assert.deepEqual(estimateAuditModelCostUsd(1), { estimatedCostUsd: 0.028, promptCount: 1, assumedModelCallsPerPrompt: 4, missingCostModels: [], estimateOnly: true });
});

test("default per-prompt cost enables the Pro gross-margin estimate", (context) => {
  const names = ["CITEMEND_MODEL_COST_CHATGPT_SEARCH_USD_PER_CALL", "CITEMEND_MODEL_COST_PERPLEXITY_SONAR_USD_PER_CALL", "CITEMEND_MODEL_COST_GOOGLE_GEMINI_USD_PER_CALL", "CITEMEND_MODEL_COST_CLAUDE_USD_PER_CALL"];
  const old = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  context.after(() => { for (const [name, value] of old) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const metrics = calculateWorkspaceOperatingMetrics({ workspaceCreatedAt: null, audits: [], recoveryActions: [], deploymentActions: [], outcomes: [], evidenceById: new Map(), tier: "pro", monthlyPriceUsd: 39, monthlyAuditCount: 1, averagePromptCount: 1 });
  assert.equal(metrics.gross_margin_estimate.estimated_cost_per_audit_usd, 0.278);
  assert.equal(metrics.gross_margin_estimate.estimated_monthly_scan_api_cost_usd, 0.278);
  assert.equal(Math.round((metrics.gross_margin_estimate.estimated_gross_margin_percent ?? 0) * 100) / 100, 99.29);
  assert.equal(metrics.gross_margin_estimate.target_met, true);
});

test("founder aggregate endpoint requires timing-safe bearer authorization", () => {
  assert.equal(validFounderMetricsAuthorization("Bearer secret-value", "secret-value"), true);
  assert.equal(validFounderMetricsAuthorization("Bearer secret-value", "secret-other"), false);
  assert.equal(validFounderMetricsAuthorization(null, "secret-value"), false);
  assert.equal(validFounderMetricsAuthorization("Bearer secret-value", ""), false);
});
