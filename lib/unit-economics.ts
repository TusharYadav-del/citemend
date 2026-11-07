import { estimateAuditModelCostUsd } from "./model-registry";

export const GROSS_MARGIN_TARGET_PERCENT = 75;
export const DEFAULT_INFRA_COST_PER_AUDIT_USD = 0.25;

export function marginGuardrailAllows(input: {
  workspaceMrrUsd: number | null;
  completedAuditsThisMonth: number;
  observedBuyerPromptCountThisMonth: number;
  nextAuditPromptCount: number;
  infrastructureCostPerAuditUsd?: number;
}) {
  if (input.workspaceMrrUsd === null || input.workspaceMrrUsd <= 0) return { allowed: true, warning: false, projectedMarginPercent: null, remainingBudgetUsd: null, reason: null as string | null };
  const infra = input.infrastructureCostPerAuditUsd ?? configuredInfrastructureCost();
  const allowedMonthlyCost = input.workspaceMrrUsd * (1 - GROSS_MARGIN_TARGET_PERCENT / 100);
  const promptCost = estimateAuditModelCostUsd(1).estimatedCostUsd;
  if (promptCost === null) return { allowed: true, warning: true, projectedMarginPercent: null, remainingBudgetUsd: null, reason: null as string | null };
  const currentEstimatedCost = Math.max(0, input.observedBuyerPromptCountThisMonth) * promptCost
    + Math.max(0, input.completedAuditsThisMonth) * infra;
  const nextEstimatedCost = Math.max(1, input.nextAuditPromptCount) * promptCost + infra;
  const projected = currentEstimatedCost + nextEstimatedCost;
  const margin = (input.workspaceMrrUsd - projected) / input.workspaceMrrUsd * 100;
  const remainingBudgetUsd = Math.max(0, allowedMonthlyCost - currentEstimatedCost);
  const allowed = projected <= allowedMonthlyCost;
  return { allowed, warning: !allowed, projectedMarginPercent: margin, remainingBudgetUsd, reason: allowed ? null : "gross_margin_guardrail" };
}

function configuredInfrastructureCost(value = process.env.CITEMEND_ESTIMATED_INFRA_COST_PER_AUDIT_USD) {
  const parsed = Number(value);
  return value?.trim() && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : DEFAULT_INFRA_COST_PER_AUDIT_USD;
}

export function estimateWorkspaceUnitEconomics(input: {
  workspaceMrrUsd: number | null;
  monthlyAuditCount: number;
  averagePromptCount: number;
  infrastructureCostPerAuditUsd?: number;
}) {
  const audits = Math.max(0, Math.floor(input.monthlyAuditCount));
  const infraPerAudit = input.infrastructureCostPerAuditUsd ?? configuredInfrastructureCost();
  const modelBudget = estimateAuditModelCostUsd(Math.max(1, input.averagePromptCount));
  const estimatedAiSearchCost = modelBudget.estimatedCostUsd;
  const estimatedAiSearchMonthlyCost = estimatedAiSearchCost === null ? null : estimatedAiSearchCost * audits;
  const estimatedInfrastructureMonthlyCost = infraPerAudit * audits;
  const estimatedTotalMonthlyCost = estimatedAiSearchMonthlyCost === null ? null : estimatedAiSearchMonthlyCost + estimatedInfrastructureMonthlyCost;
  const mrr = input.workspaceMrrUsd;
  const grossMarginPercent = mrr !== null && mrr > 0 && estimatedTotalMonthlyCost !== null
    ? (mrr - estimatedTotalMonthlyCost) / mrr * 100 : null;
  return {
    workspace_mrr_usd: mrr,
    monthly_audit_count: audits,
    average_prompt_count: Math.max(1, input.averagePromptCount),
    estimated_ai_search_cost_per_audit_usd: estimatedAiSearchCost,
    estimated_infrastructure_cost_per_audit_usd: infraPerAudit,
    estimated_monthly_ai_search_cost_usd: estimatedAiSearchMonthlyCost,
    estimated_monthly_infrastructure_cost_usd: estimatedInfrastructureMonthlyCost,
    estimated_total_monthly_cost_usd: estimatedTotalMonthlyCost,
    estimated_gross_margin_percent: grossMarginPercent,
    gross_margin_warning: grossMarginPercent !== null && grossMarginPercent < GROSS_MARGIN_TARGET_PERCENT,
    target_percent: GROSS_MARGIN_TARGET_PERCENT,
    estimate_only: true,
    missing_model_costs: modelBudget.missingCostModels,
    note: "Estimated AI/search and shared crawler/hosting cost only. This is not a metered provider invoice or accounting gross margin; set CITEMEND_ESTIMATED_INFRA_COST_PER_AUDIT_USD from measured infrastructure usage.",
  };
}
