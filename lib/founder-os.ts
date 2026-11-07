import { activePlanMonthlyPriceUsd } from "./billing";

export const WEEKLY_OPERATING_TARGETS = [
  { id: "customer_conversations", label: "Potential customer conversations", target: 10, stretchTarget: 15, unit: "conversations" },
  { id: "product_demos", label: "Personalized product demonstrations", target: 5, unit: "demos" },
  { id: "proposals_or_pilots", label: "Proposals or paid pilot offers", target: 2, stretchTarget: 3, unit: "offers" },
  { id: "customer_improvements", label: "Customer-driven product improvements", target: 1, unit: "improvement" },
  { id: "public_education", label: "Educational posts or recovery case studies", target: 1, unit: "post / case study" },
  { id: "weekly_review_complete", label: "Churn, usage, support, and infrastructure review", target: 1, unit: "review", checkbox: true },
] as const;

export type FounderScorecard = {
  customer_conversations: number;
  product_demos: number;
  proposals_or_pilots: number;
  customer_improvements: number;
  public_education: number;
  weekly_review_complete: boolean;
};

export const EMPTY_FOUNDER_SCORECARD: FounderScorecard = {
  customer_conversations: 0, product_demos: 0, proposals_or_pilots: 0,
  customer_improvements: 0, public_education: 0, weekly_review_complete: false,
};

export function currentFounderWeekStart(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
}

export function parseFounderAllowlist(value = process.env.CITEMEND_FOUNDER_USER_IDS): string[] {
  return [...new Set((value ?? "").split(",").map(item => item.trim()).filter(Boolean))];
}

export function validateFounderScorecard(value: unknown): FounderScorecard {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Provide a founder weekly scorecard.");
  const input = value as Record<string, unknown>;
  const count = (key: keyof Omit<FounderScorecard, "weekly_review_complete">) => {
    const n = input[key];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 10000) throw new TypeError(`Enter a whole-number count for ${key}.`);
    return n;
  };
  if (typeof input.weekly_review_complete !== "boolean") throw new TypeError("weekly_review_complete must be true or false.");
  return {
    customer_conversations: count("customer_conversations"), product_demos: count("product_demos"),
    proposals_or_pilots: count("proposals_or_pilots"), customer_improvements: count("customer_improvements"),
    public_education: count("public_education"), weekly_review_complete: input.weekly_review_complete,
  };
}

export function summarizeFounderTargets(scorecard: FounderScorecard) {
  const target = Object.fromEntries(WEEKLY_OPERATING_TARGETS.map(item => [item.id, {
    current: scorecard[item.id as keyof FounderScorecard],
    target: item.target,
    stretchTarget: "stretchTarget" in item ? item.stretchTarget : item.target,
    achieved: item.id === "weekly_review_complete" ? scorecard.weekly_review_complete : Number(scorecard[item.id as keyof FounderScorecard]) >= item.target,
  }])) as Record<string, { current: number | boolean; target: number; stretchTarget: number; achieved: boolean }>;
  return { scorecard, targets: target };
}

export type RevenueSubscription = { user_id: string; plan: string | null; status: string; cancelled: boolean; ends_at?: string | null; current_period_end?: string | null };
export type RevenueWorkspace = { user_id: string; domain: string; segment: string | null };

function subscriptionIsActive(row: RevenueSubscription, now: number) {
  if (row.plan === "pro_beta") return row.status === "active" && !!row.current_period_end && Date.parse(row.current_period_end) > now;
  if (row.cancelled || row.status === "cancelled") return !!row.ends_at && Date.parse(row.ends_at) > now;
  return ["active", "on_trial", "past_due"].includes(row.status);
}

export function buildFounderRevenueSnapshot(subscriptions: RevenueSubscription[], workspaces: RevenueWorkspace[], now = Date.now()) {
  const active = subscriptions.filter(row => subscriptionIsActive(row, now));
  const byOwner = new Map<string, RevenueSubscription>();
  for (const row of active) if (!byOwner.has(row.user_id) || row.plan === "agency") byOwner.set(row.user_id, row);
  const workspaceByOwner = new Map<string, RevenueWorkspace[]>();
  for (const workspace of workspaces) workspaceByOwner.set(workspace.user_id, [...(workspaceByOwner.get(workspace.user_id) ?? []), workspace]);
  const mix: Record<string, number> = { agency: 0, b2b_saas: 0, ecommerce: 0, enterprise: 0, other: 0 };
  let mrrUsd = 0;
  let unpricedActiveSubscriptions = 0;
  for (const [ownerId, subscription] of byOwner) {
    const price = activePlanMonthlyPriceUsd(subscription.plan);
    if (price === null) unpricedActiveSubscriptions++;
    else mrrUsd += price;
    const rows = workspaceByOwner.get(ownerId) ?? [];
    const preferred = subscription.plan === "agency" ? "agency" : subscription.plan === "enterprise" ? "enterprise" : rows.map(row => row.segment).find(segment => segment === "ecommerce" || segment === "b2b_saas" || segment === "agency") ?? "b2b_saas";
    mix[preferred] = (mix[preferred] ?? 0) + (price ?? 0);
  }
  return {
    planPricedEstimatedMrrUsd: mrrUsd,
    planPricedEstimatedArrUsd: mrrUsd * 12,
    activeSubscriptionCount: byOwner.size,
    unpricedActiveSubscriptions,
    segmentMixEstimatedMrrUsd: mix,
    measurementNote: "Estimated from active Pro ($39) and Agency ($249) monthly variants currently recorded by the billing webhook. Quote-only/unknown plans are excluded and counted separately; this is not a finance ledger or recognized revenue.",
  };
}

export const REVENUE_MILESTONES = [
  { month: 1, targetMrrUsd: 1000, label: "Month 1" },
  { month: 4, targetMrrUsd: 10000, label: "Month 4" },
  { month: 12, targetMrrUsd: 84000, label: "Month 12 · $1M+ ARR run rate" },
] as const;
