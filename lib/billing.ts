import { estimateAuditModelCostUsd } from "./model-registry";
import { PLAN_TIERS, type TierName } from "./integrations-workflow";

export type ContractCurrency = "USD" | "INR";
export type ContractCadence = "monthly" | "annual";
export type CommercialTier = "free_audit" | "starter" | "growth" | "professional" | "agency" | "enterprise";

export const ANNUAL_BILLING_MONTHS = 10;
export const ANNUAL_DISCOUNT_PERCENT = Number(((12 - ANNUAL_BILLING_MONTHS) / 12 * 100).toFixed(2));

type PriceRange = { min: number; max: number | null };
type TierPlan = {
  label: string;
  monthlyUsd: PriceRange;
  monthlyInr: PriceRange | null;
  description: string;
  checkoutPlan: "free" | "pro" | "agency" | "quote_only";
};

export const TARGET_GROSS_MARGIN_PERCENT = 75;
export const DEFAULT_ESTIMATED_INR_PER_USD = 94.4;

function estimatedMonthlyDeliveryCostUsd(tier: CommercialTier): number | null {
  if (tier === "free_audit") return 0;
  const plan = PLAN_TIERS[tier as TierName];
  const maximumScans = Math.min(plan.monthlyAudits, Math.floor(plan.modelCalls / 5));
  const maximumPrompts = Math.min(plan.monthlyAudits * plan.promptsPerAudit, Math.floor(plan.modelCalls / 5));
  const aiCost = estimateAuditModelCostUsd(Math.max(1, maximumPrompts)).estimatedCostUsd;
  if (aiCost === null) return null;
  const rawInfra = Number(process.env.CITEMEND_ESTIMATED_INFRA_COST_PER_AUDIT_USD);
  const infraPerAudit = Number.isFinite(rawInfra) && rawInfra >= 0 && rawInfra <= 100 ? rawInfra : 0.25;
  return aiCost + maximumScans * infraPerAudit;
}

function estimatedInrPerUsd() {
  const configured = Number(process.env.CITEMEND_ESTIMATED_INR_PER_USD);
  return Number.isFinite(configured) && configured >= 1 && configured <= 1000 ? configured : DEFAULT_ESTIMATED_INR_PER_USD;
}

export const COMMERCIAL_TIERS: Record<CommercialTier, TierPlan> = {
  free_audit: { label: "Free Audit", monthlyUsd: { min: 0, max: 0 }, monthlyInr: { min: 0, max: 0 }, description: "One saved audit", checkoutPlan: "free" },
  starter: { label: "Starter", monthlyUsd: { min: 49, max: 79 }, monthlyInr: { min: 2999, max: 2999 }, description: "Small websites", checkoutPlan: "quote_only" },
  growth: { label: "Growth", monthlyUsd: { min: 149, max: 249 }, monthlyInr: { min: 8999, max: 8999 }, description: "Growing B2B SaaS teams", checkoutPlan: "quote_only" },
  professional: { label: "Professional", monthlyUsd: { min: 399, max: 599 }, monthlyInr: { min: 19999, max: 19999 }, description: "Larger SaaS and ecommerce teams", checkoutPlan: "quote_only" },
  agency: { label: "Agency", monthlyUsd: { min: 699, max: 999 }, monthlyInr: { min: 34999, max: 34999 }, description: "Multi-client and white-label workspaces", checkoutPlan: "agency" },
  enterprise: { label: "Enterprise", monthlyUsd: { min: 2500, max: null }, monthlyInr: null, description: "SSO, RBAC, and custom quotas", checkoutPlan: "quote_only" },
};

export function annualPrepay(monthlyAmount: number): { annualTotal: number; effectiveMonthly: number; discountPercent: number } {
  if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) throw new RangeError("Monthly contract price must be a non-negative number.");
  const annualTotal = Math.round(monthlyAmount * ANNUAL_BILLING_MONTHS * 100) / 100;
  return { annualTotal, effectiveMonthly: Math.round(annualTotal / 12 * 100) / 100, discountPercent: ANNUAL_DISCOUNT_PERCENT };
}

export function contractPriceRange(tier: CommercialTier, currency: ContractCurrency, cadence: ContractCadence) {
  const range = currency === "USD" ? COMMERCIAL_TIERS[tier].monthlyUsd : COMMERCIAL_TIERS[tier].monthlyInr;
  if (!range) return { min: null, max: null, display: "Custom quote", currency, cadence, discountPercent: 0, maxDiscountPercent: 0, marginFloorApplied: false, estimatedMonthlyDeliveryCostUsd: null, targetGrossMarginPercent: TARGET_GROSS_MARGIN_PERCENT, fxEstimateInrPerUsd: currency === "INR" ? estimatedInrPerUsd() : null };
  const deliveryCost = estimatedMonthlyDeliveryCostUsd(tier);
  const currencyPerUsd = currency === "INR" ? estimatedInrPerUsd() : 1;
  const baseMultiplier = cadence === "annual" ? ANNUAL_BILLING_MONTHS : 1;
  const monthlyCostFloor = deliveryCost === null ? 0 : Math.ceil(deliveryCost / (1 - TARGET_GROSS_MARGIN_PERCENT / 100) * currencyPerUsd);
  const annualCostFloor = monthlyCostFloor * 12;
  const min = Math.max(range.min * baseMultiplier, cadence === "annual" ? annualCostFloor : monthlyCostFloor);
  const max = range.max === null ? null : Math.max(range.max * baseMultiplier, cadence === "annual" ? annualCostFloor : monthlyCostFloor);
  const minMonthlyPrice = Math.max(range.min, monthlyCostFloor);
  const maxMonthlyPrice = range.max === null ? null : Math.max(range.max, monthlyCostFloor);
  const discountPercent = cadence === "annual" && minMonthlyPrice > 0
    ? Math.max(0, Math.min(100, Number(((1 - min / (minMonthlyPrice * 12)) * 100).toFixed(2))))
    : 0;
  const maxDiscountPercent = cadence === "annual" && maxMonthlyPrice !== null && maxMonthlyPrice > 0
    ? Math.max(0, Math.min(100, Number(((1 - (max ?? maxMonthlyPrice * 12) / (maxMonthlyPrice * 12)) * 100).toFixed(2))))
    : discountPercent;
  return {
    min, max, display: max === null ? `${min}+` : min === max ? String(min) : `${min}–${max}`,
    currency, cadence, discountPercent, maxDiscountPercent,
    marginFloorApplied: cadence === "annual" ? annualCostFloor > range.min * baseMultiplier : monthlyCostFloor > range.min,
    estimatedMonthlyDeliveryCostUsd: deliveryCost,
    targetGrossMarginPercent: TARGET_GROSS_MARGIN_PERCENT,
    fxEstimateInrPerUsd: currency === "INR" ? currencyPerUsd : null,
  };
}

export function activePlanMonthlyPriceUsd(plan: string | null | undefined): number | null {
  switch (plan?.toLowerCase()) {
    case "pro": case "professional": return 39;
    case "agency": return 249;
    case "pro_beta": return 0;
    case "free_audit": return 0;
    default: return null;
  }
}
