import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { parseFounderAllowlist, currentFounderWeekStart, EMPTY_FOUNDER_SCORECARD, validateFounderScorecard, summarizeFounderTargets, buildFounderRevenueSnapshot } from "@/lib/founder-os";
import { activePlanMonthlyPriceUsd } from "@/lib/billing";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function founderId() {
  const { userId } = await auth();
  return userId && parseFounderAllowlist().includes(userId) ? userId : null;
}
const mean = (values: Array<number | null | undefined>) => {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
};

export async function GET() {
  const userId = await founderId();
  if (!userId) return json({ error: "Founder access is not configured for this account." }, 403);
  try {
    const db = createServerDatabase();
    const weekStart = currentFounderWeekStart();
    const [baselines, subscriptions, policies, savedScorecard] = await Promise.all([
      db.from("workspace_operating_metrics").select("user_id,workspace_domain,workspace_created_at").limit(5000),
      db.from("subscriptions").select("user_id,plan,status,cancelled,ends_at,current_period_end").limit(5000),
      db.from("workspace_governance_policies").select("user_id,workspace_domain,benchmark_category").limit(5000),
      db.from("founder_weekly_scorecards").select("week_start,scorecard_json").eq("founder_user_id", userId).eq("week_start", weekStart).maybeSingle(),
    ]);
    if (baselines.error || subscriptions.error || policies.error || savedScorecard.error) throw baselines.error ?? subscriptions.error ?? policies.error ?? savedScorecard.error;
    const owners = [...new Set((baselines.data ?? []).map(row => row.user_id))];
    const workspaceMetrics = owners.length ? await (await import("@/lib/operating-metrics")).getWorkspaceOperatingMetrics(db, owners) : { workspaces: [], founder: { total_workspaces: 0, activated_workspaces: 0, customer_activation_rate_percent: null } };
    const metrics = workspaceMetrics.workspaces.map(item => item.metrics);
    const workspaceRows = (baselines.data ?? []).map(row => ({ user_id: row.user_id, domain: row.workspace_domain, segment: policies.data?.find(policy => policy.user_id === row.user_id && policy.workspace_domain === row.workspace_domain)?.benchmark_category ?? null }));
    const revenue = buildFounderRevenueSnapshot((subscriptions.data ?? []).map(row => ({ ...row, plan: row.plan, current_period_end: row.current_period_end })), workspaceRows);
    return json({
      weekStart,
      ...summarizeFounderTargets(savedScorecard.data?.scorecard_json ? validateFounderScorecard(savedScorecard.data.scorecard_json) : EMPTY_FOUNDER_SCORECARD),
      revenue,
      operatingMetrics: {
        workspaceCount: workspaceMetrics.founder.total_workspaces,
        activationPercent: workspaceMetrics.founder.customer_activation_rate_percent,
        meanTimeToFirstUsefulAuditMinutes: mean(metrics.map(item => item.time_to_first_useful_audit_minutes)),
        meanTimeToFirstRecoveryActionMinutes: mean(metrics.map(item => item.time_to_first_recovery_action_minutes)),
        redirectDeploymentVerificationPercent: mean(metrics.map(item => item.redirect_deployment_verification_rate_percent)),
        evidenceCompletenessPercent: mean(metrics.map(item => item.evidence_completeness_rate_percent)),
        grossMarginEstimatePercent: mean(metrics.map(item => item.gross_margin_estimate.estimated_gross_margin_percent)),
        grossMarginWarningWorkspaces: metrics.filter(item => item.gross_margin_estimate.margin_warning).length,
        grrPercent: null,
        nrrPercent: null,
        measurementNote: "GRR/NRR are not measured because billing history does not yet persist cohort-level renewals or expansion events. Gross margin is estimated from current plan price and configured AI/search/crawler budgets.",
      },
      billingAssumptions: { proMonthlyUsd: activePlanMonthlyPriceUsd("pro"), agencyMonthlyUsd: activePlanMonthlyPriceUsd("agency"), labels: "Plan-priced estimates; annual planning contracts are not live checkout products." },
    });
  } catch {
    return json({ error: "Founder operating data is temporarily unavailable. Apply migration 032 and confirm its hosted schema." }, 503);
  }
}

export async function PUT(request: Request) {
  const userId = await founderId();
  if (!userId) return json({ error: "Founder access is not configured for this account." }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Send a JSON scorecard." }, 400); }
  let scorecard;
  try { scorecard = validateFounderScorecard(body); } catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid scorecard." }, 400); }
  try {
    const db = createServerDatabase();
    const weekStart = currentFounderWeekStart();
    const { error } = await db.from("founder_weekly_scorecards").upsert({ founder_user_id: userId, week_start: weekStart, scorecard_json: scorecard, updated_at: new Date().toISOString() }, { onConflict: "founder_user_id,week_start" });
    if (error) throw error;
    return json({ saved: true, weekStart, ...summarizeFounderTargets(scorecard) });
  } catch { return json({ error: "Founder scorecard could not be saved." }, 503); }
}
