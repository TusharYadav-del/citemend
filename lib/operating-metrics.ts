import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { createServerDatabase } from "./supabase-server";
import { estimateAuditModelCostUsd } from "./model-registry";
import { grantsProAccess } from "./subscription";

type Db = ReturnType<typeof createServerDatabase>;
type Row = Record<string, unknown>;
const timestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const iso = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator * 100 : null;

export async function ensureWorkspaceOperatingBaseline(db: Db, userId: string, domain: string, workspaceCreatedAt = new Date().toISOString()) {
  const result = await db.from("workspace_operating_metrics").upsert({ user_id: userId, workspace_domain: domain, workspace_created_at: workspaceCreatedAt, baseline_method: "first_valid_audit_submission" }, { onConflict: "user_id,workspace_domain", ignoreDuplicates: true });
  if (result.error) throw result.error;
}

function evidenceIsComplete(row: Row | undefined) {
  return !!row && typeof row.id === "string" && typeof row.prompt_query === "string" && !!row.prompt_query.trim()
    && typeof row.provider === "string" && !!row.provider.trim() && typeof row.model_name === "string" && !!row.model_name.trim()
    && typeof row.prompt_version === "string" && !!row.prompt_version.trim() && typeof row.search_method === "string" && !!row.search_method.trim()
    && typeof row.locale === "string" && !!row.locale.trim() && typeof row.raw_answer === "string" && !!row.raw_answer.trim()
    && Array.isArray(row.extracted_urls_json) && typeof row.sample_size === "number" && row.sample_size > 0
    && typeof row.observed_at === "string" && timestamp(row.observed_at) !== null;
}

export function calculateWorkspaceOperatingMetrics(input: {
  workspaceCreatedAt: string | null;
  audits: Row[];
  recoveryActions: Row[];
  deploymentActions: Row[];
  outcomes: Row[];
  evidenceById: Map<string, Row>;
  tier: string;
  monthlyPriceUsd: number | null;
  monthlyAuditCount: number;
  averagePromptCount: number;
}) {
  const createdMs = timestamp(input.workspaceCreatedAt);
  const audits = [...input.audits].filter((audit) => createdMs === null || (timestamp(audit.completed_at) ?? timestamp(audit.created_at) ?? 0) >= createdMs).sort((a, b) => (timestamp(a.completed_at) ?? timestamp(a.created_at) ?? 0) - (timestamp(b.completed_at) ?? timestamp(b.created_at) ?? 0));
  const firstComplete = audits.find((audit) => audit.status === "completed");
  const firstCompleteAt = firstComplete ? iso(firstComplete.completed_at) : null;
  const firstCompleteMs = timestamp(firstCompleteAt);
  const firstRecovery = input.recoveryActions.map((action) => iso(action.approved_at) ?? iso(action.deployed_at) ?? (action.action_type === "redirect_deployment" ? iso(action.created_at) : null)).filter((at): at is string => {
    const actionMs = timestamp(at);
    return !!at && actionMs !== null && firstCompleteMs !== null && (createdMs === null || actionMs >= createdMs) && actionMs >= firstCompleteMs;
  }).sort()[0] ?? null;
  const recoveryMs = timestamp(firstRecovery);
  const timeToFirstUsefulAuditMinutes = createdMs !== null && firstCompleteMs !== null && firstCompleteMs >= createdMs ? (firstCompleteMs - createdMs) / 60_000 : null;
  const timeToFirstRecoveryActionMinutes = firstCompleteMs !== null && recoveryMs !== null && recoveryMs >= firstCompleteMs ? (recoveryMs - firstCompleteMs) / 60_000 : null;
  const verifiedOutcomes = input.outcomes.filter((outcome) => !!outcome.technical_deployment_verified_at || !!outcome.ai_citation_observed_at);
  const completeEvidenceOutcomes = verifiedOutcomes.filter((outcome) => typeof outcome.evidence_id === "string" && evidenceIsComplete(input.evidenceById.get(outcome.evidence_id)));
  const verifiedDestinations = new Set(verifiedOutcomes.filter((outcome) => outcome.technical_deployment_verified_at).map((outcome) => String(outcome.canonical_destination_url)));
  const verifiedDeploymentActions = input.deploymentActions.filter((action) => typeof action.target_url === "string" && verifiedDestinations.has(action.target_url));
  const cost = estimateAuditModelCostUsd(input.averagePromptCount);
  const monthlyEstimatedScanCostUsd = cost.estimatedCostUsd === null ? null : cost.estimatedCostUsd * input.monthlyAuditCount;
  const estimatedGrossMarginPercent = input.monthlyPriceUsd !== null && input.monthlyPriceUsd > 0 && monthlyEstimatedScanCostUsd !== null
    ? (input.monthlyPriceUsd - monthlyEstimatedScanCostUsd) / input.monthlyPriceUsd * 100 : null;
  return {
    workspace_created_at: input.workspaceCreatedAt,
    workspace_creation_measurement: "First valid audit submission (proxy; no separate workspace creation event exists in the current product).",
    first_useful_audit_at: firstCompleteAt,
    time_to_first_useful_audit_minutes: timeToFirstUsefulAuditMinutes,
    time_to_first_useful_audit_target_met: timeToFirstUsefulAuditMinutes !== null && timeToFirstUsefulAuditMinutes < 15,
    first_recovery_action_at: firstRecovery,
    time_to_first_recovery_action_minutes: timeToFirstRecoveryActionMinutes,
    time_to_first_recovery_action_target_met: timeToFirstRecoveryActionMinutes !== null && timeToFirstRecoveryActionMinutes < 30,
    redirect_deployment_verification_rate_percent: ratio(verifiedDeploymentActions.length, input.deploymentActions.length),
    redirect_deployment_actions: input.deploymentActions.length,
    redirect_deployment_actions_verified: verifiedDeploymentActions.length,
    evidence_completeness_rate_percent: ratio(completeEvidenceOutcomes.length, verifiedOutcomes.length),
    verified_outcomes: verifiedOutcomes.length,
    verified_outcomes_with_complete_evidence: completeEvidenceOutcomes.length,
    customer_activation: { activated: !!firstComplete, milestone: firstComplete ? "first_completed_audit" : "awaiting_first_completed_audit", first_recovery_action_completed: !!firstRecovery },
    gross_margin_estimate: {
      tier: input.tier,
      monthly_plan_price_usd: input.monthlyPriceUsd,
      estimated_cost_per_audit_usd: cost.estimatedCostUsd,
      estimated_audits_this_month: input.monthlyAuditCount,
      estimated_monthly_scan_api_cost_usd: monthlyEstimatedScanCostUsd,
      estimated_gross_margin_percent: estimatedGrossMarginPercent,
      target_percent: 75,
      target_met: estimatedGrossMarginPercent !== null && estimatedGrossMarginPercent >= 75,
      cost_estimate_only: true,
      unconfigured_model_costs: cost.missingCostModels,
      note: "Model-call cost assumptions are operator-configured estimates; provider token usage, infrastructure, payment fees, and actual recognized revenue are not included.",
    },
  };
}

function priceForPlan(plan: string | null, active: boolean) {
  if (!active) return { tier: "free", monthlyPriceUsd: 0 };
  if (plan === "agency") return { tier: "agency", monthlyPriceUsd: 249 };
  if (plan === "pro" || plan === "professional" || plan === "pro_beta") return { tier: plan, monthlyPriceUsd: plan === "pro_beta" ? 0 : 39 };
  if (plan === "starter" || plan === "growth" || plan === "enterprise") return { tier: plan, monthlyPriceUsd: null };
  return { tier: plan ?? "unknown", monthlyPriceUsd: null };
}

export async function getWorkspaceOperatingMetrics(db: Db, ownerUserIds: string[], requestedDomain?: string | null, actorUserIds = ownerUserIds) {
  const [baselineResult, auditsResult, subscriptionsResult] = await Promise.all([
    db.from("workspace_operating_metrics").select("user_id,workspace_domain,workspace_created_at,baseline_method").in("user_id", ownerUserIds).limit(5000),
    db.from("audits").select("id,user_id,domain,status,created_at,completed_at").in("user_id", ownerUserIds).limit(10000),
    db.from("subscriptions").select("user_id,plan,status,cancelled,ends_at,current_period_end").in("user_id", ownerUserIds).limit(1000),
  ]);
  const error = baselineResult.error ?? auditsResult.error ?? subscriptionsResult.error;
  if (error) throw error;
  const audits = (auditsResult.data ?? []).filter((item) => !requestedDomain || item.domain === requestedDomain);
  const domains = [...new Set([...(audits.map((item) => item.domain)), ...(baselineResult.data ?? []).map((item) => item.workspace_domain)])].filter((domain) => !requestedDomain || domain === requestedDomain);
  const ids = audits.map((item) => item.id);
  const baselines = new Map((baselineResult.data ?? []).map((item) => [item.workspace_domain, item]));
  const workspaceRows = domains.map((domain) => baselines.get(domain) ?? { user_id: ownerUserIds[0] ?? "", workspace_domain: domain, workspace_created_at: null, baseline_method: null });
  if (!ids.length) {
    const workspaces = workspaceRows.map((workspace) => ({ domain: workspace.workspace_domain, metrics: calculateWorkspaceOperatingMetrics({ workspaceCreatedAt: workspace.workspace_created_at, audits: [], recoveryActions: [], deploymentActions: [], outcomes: [], evidenceById: new Map(), tier: "unknown", monthlyPriceUsd: null, monthlyAuditCount: 0, averagePromptCount: 1 }) }));
    return { workspaces, founder: { total_workspaces: workspaceRows.length, activated_workspaces: 0, customer_activation_rate_percent: ratio(0, workspaceRows.length) } };
  }
  const [linksResult, outcomesResult, actionsResult, observationsResult] = await Promise.all([
    db.from("broken_links").select("id,audit_id,approval_status,approved_at,deployed_at,created_at").in("audit_id", ids).limit(10000),
    db.from("recovery_outcomes").select("id,audit_id,domain,canonical_destination_url,technical_deployment_verified_at,ai_citation_observed_at,evidence_id,created_at").in("audit_id", ids).limit(10000),
    db.from("action_audit_logs").select("id,workspace_domain,actor_user_id,action_type,target_url,safety_check_passed,new_state_json,created_at").in("workspace_domain", domains).in("actor_user_id", actorUserIds).in("action_type", ["redirect_deployment"]).limit(10000),
    db.from("ai_observation_evidence").select("id,audit_id,prompt_query,prompt_version,provider,model_name,search_method,locale,raw_answer,extracted_urls_json,sample_size,observed_at").in("audit_id", ids).limit(20000),
  ]);
  const detailError = linksResult.error ?? outcomesResult.error ?? actionsResult.error ?? observationsResult.error;
  if (detailError) throw detailError;
  const outcomes = outcomesResult.data ?? [];
  const evidenceIds = [...new Set(outcomes.map((row) => row.evidence_id).filter((id): id is string => !!id))];
  const evidenceById = new Map((observationsResult.data ?? []).map((row) => [row.id, row as unknown as Row]));
  // Evidence linked to old outcomes may not be in the audit-evidence window due to result caps.
  if (evidenceIds.some((id) => !evidenceById.has(id))) {
    const linked = await db.from("ai_observation_evidence").select("id,prompt_query,prompt_version,provider,model_name,search_method,locale,raw_answer,extracted_urls_json,sample_size,observed_at").in("id", evidenceIds).limit(10000);
    if (linked.error) throw linked.error;
    for (const row of linked.data ?? []) evidenceById.set(row.id, row as unknown as Row);
  }
  const currentMonth = new Date(); currentMonth.setUTCDate(1); currentMonth.setUTCHours(0, 0, 0, 0);
  const workspaceMetrics = workspaceRows.map((workspace) => {
    const ownedAudits = audits.filter((item) => item.domain === workspace.workspace_domain && (!workspace.workspace_created_at || (timestamp(item.created_at) ?? 0) >= (timestamp(workspace.workspace_created_at) ?? 0)));
    const auditIdSet = new Set(ownedAudits.map((item) => item.id));
    const links = (linksResult.data ?? []).filter((item) => auditIdSet.has(item.audit_id));
    const domainOutcomes = outcomes.filter((item) => item.domain === workspace.workspace_domain && auditIdSet.has(item.audit_id));
    const deploymentActions = (actionsResult.data ?? []).filter((item) => item.workspace_domain === workspace.workspace_domain);
    const observations = (observationsResult.data ?? []).filter((item) => auditIdSet.has(item.audit_id));
    const recentAuditIds = new Set(ownedAudits.filter((item) => (timestamp(item.created_at) ?? 0) >= currentMonth.getTime()).map((item) => item.id));
    const monthlyObservations = observations.filter((item) => recentAuditIds.has(item.audit_id));
    const promptsPerScan = recentAuditIds.size ? Math.max(1, monthlyObservations.length / recentAuditIds.size) : 1;
    const subscription = (subscriptionsResult.data ?? []).filter((item) => item.user_id === workspace.user_id && grantsProAccess(item)).sort((a, b) => Number(b.plan === "agency") - Number(a.plan === "agency"))[0];
    const plan = priceForPlan(subscription?.plan ?? null, !!subscription);
    const completedThisMonth = ownedAudits.filter((item) => item.status === "completed" && (timestamp(item.completed_at) ?? timestamp(item.created_at) ?? 0) >= currentMonth.getTime()).length;
    return { domain: workspace.workspace_domain, metrics: calculateWorkspaceOperatingMetrics({ workspaceCreatedAt: workspace.workspace_created_at, audits: ownedAudits as unknown as Row[], recoveryActions: links as unknown as Row[], deploymentActions: deploymentActions as unknown as Row[], outcomes: domainOutcomes as unknown as Row[], evidenceById, tier: plan.tier, monthlyPriceUsd: plan.monthlyPriceUsd, monthlyAuditCount: completedThisMonth, averagePromptCount: promptsPerScan }) };
  });
  const activated = workspaceMetrics.filter((item) => item.metrics.customer_activation.activated).length;
  return { workspaces: workspaceMetrics, founder: { total_workspaces: workspaceRows.length, activated_workspaces: activated, customer_activation_rate_percent: ratio(activated, workspaceRows.length) } };
}

export function validFounderMetricsAuthorization(header: string | null, secret = process.env.FOUNDER_METRICS_SECRET) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7)); const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
