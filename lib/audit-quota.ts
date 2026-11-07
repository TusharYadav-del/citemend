import "server-only";
import { createServerDatabase } from "./supabase-server";
import { PLAN_TIERS, type TierName } from "./integrations-workflow";
import { grantsProAccess } from "./subscription";
import { activePlanMonthlyPriceUsd } from "./billing";
import { marginGuardrailAllows } from "./unit-economics";

export function planTier(plan: string | null | undefined, active: boolean): TierName {
  if (!active) return "free_audit";
  if (plan === "agency") return "agency";
  if (plan === "enterprise") return "enterprise";
  if (plan === "starter") return "starter";
  if (plan === "growth") return "growth";
  return "professional";
}

export async function getAuditQuota(userId: string, requestedPromptCount: number, now = new Date()) {
  const db = createServerDatabase();
  const [subscriptionResult, auditResult] = await Promise.all([
    db.from("subscriptions").select("plan,status,cancelled,ends_at,current_period_end").eq("user_id", userId).limit(100),
    db.from("audits").select("id,sitemap_url_count", { count: "exact" }).eq("user_id", userId).gte("created_at", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()).limit(1000),
  ]);
  if (subscriptionResult.error || auditResult.error) throw new Error("Tier quota usage is temporarily unavailable.");
  const active = (subscriptionResult.data ?? []).filter(item => grantsProAccess(item, now.getTime()));
  const selected = active.find(item => item.plan === "agency") ?? active[0];
  const tier = planTier(selected?.plan, !!selected);
  const limits = PLAN_TIERS[tier];
  const audits = auditResult.data ?? [];
  if ((auditResult.count ?? audits.length) + 1 > limits.monthlyAudits) return { allowed: false as const, reason: "monthly_audits" as const, tier, maxSitemapPages: 0 };
  if (requestedPromptCount > limits.promptsPerAudit) return { allowed: false as const, reason: "prompts_per_audit" as const, tier, maxSitemapPages: 0 };
  const auditIds = audits.map(item => item.id);
  const usedModelCalls = auditIds.length ? await db.from("ai_observation_evidence").select("id", { count: "exact", head: true }).in("audit_id", auditIds) : { count: 0, error: null };
  if (usedModelCalls.error) throw new Error("Tier model-call usage is temporarily unavailable.");
  const margin = marginGuardrailAllows({
    workspaceMrrUsd: activePlanMonthlyPriceUsd(selected?.plan),
    completedAuditsThisMonth: auditResult.count ?? audits.length,
    observedBuyerPromptCountThisMonth: usedModelCalls.count ?? 0,
    nextAuditPromptCount: requestedPromptCount,
  });
  if (!margin.allowed) return { allowed: false as const, reason: "gross_margin_guardrail" as const, tier, maxSitemapPages: 0 };
  const usedPages = audits.reduce((sum, item) => sum + (item.sitemap_url_count ?? 0), 0);
  const remainingModels = limits.modelCalls - (usedModelCalls.count ?? 0);
  const expectedCalls = requestedPromptCount * 5;
  if (remainingModels < expectedCalls) return { allowed: false as const, reason: "monthly_model_calls" as const, tier, maxSitemapPages: 0 };
  const maxSitemapPages = Math.min(20_000, limits.pagesCrawled - usedPages);
  if (maxSitemapPages < 1) return { allowed: false as const, reason: "monthly_crawl_pages" as const, tier, maxSitemapPages: 0 };
  return { allowed: true as const, tier, maxSitemapPages };
}
