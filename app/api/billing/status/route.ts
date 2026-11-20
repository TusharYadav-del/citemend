import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { grantsProAccess } from "@/lib/subscription";
import { PLAN_TIERS } from "@/lib/integrations-workflow";
import { planTier } from "@/lib/audit-quota";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { canWorkspace } from "@/lib/rbac";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  let session: Awaited<ReturnType<typeof auth>>;
  try { session = await auth(); } catch { return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503, headers }); }
  if (!session.userId) return Response.json({ error: "Sign in to view billing." }, { status: 401, headers });
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    if (!canWorkspace(access.role, "manage_integrations")) return Response.json({ error: "Workspace administrator access is required for billing." }, { status: 403, headers });
    const ownerUserId = access.ownerUserIds[0];
    const workspaceId = access.organizationId ?? ownerUserId;
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const [subscriptions, audits] = await Promise.all([
      db.from("subscriptions").select("id,user_id,workspace_id,plan,plan_name,status,cancelled,ends_at,renews_at,current_period_end,test_mode,billing_provider,updated_at").eq("user_id", ownerUserId).eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(50),
      db.from("audits").select("id", { count: "exact", head: true }).in("user_id", access.ownerUserIds).gte("created_at", monthStart.toISOString()),
    ]);
    if (subscriptions.error || audits.error) throw new Error("Billing data is unavailable. Apply the latest billing migration.");
    const rows = subscriptions.data ?? [];
    const paid = rows.filter(row => row.plan !== "pro_beta");
    const active = paid.find(row => grantsProAccess(row));
    const selected = active ?? paid[0] ?? null;
    const current = active ?? selected;
    const tier = active ? planTier(active.plan_name ?? active.plan, true) : "free_audit";
    return Response.json({
      plan: active ? (active.plan_name ?? (active.plan === "agency" ? "agency" : active.plan === "growth" ? "growth" : "starter")) : "free",
      status: current?.status ?? "free",
      active: !!active,
      hasSubscription: !!selected,
      renewsAt: active?.renews_at ?? null,
      endsAt: current?.ends_at ?? null,
      testMode: active?.test_mode === true,
      customerPortalUrl: null,
      updatePaymentMethodUrl: null,
      quotaUsage: { auditsThisMonth: audits.count ?? 0, monthlyAuditLimit: PLAN_TIERS[tier].monthlyAudits },
    }, { headers });
  } catch {
    return Response.json({ error: "Billing status is temporarily unavailable. Apply the latest billing migration." }, { status: 503, headers });
  }
}
