import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { grantsProAccess } from "@/lib/subscription";
import { PLAN_TIERS } from "@/lib/integrations-workflow";
import { planTier } from "@/lib/audit-quota";
import { freshBillingUrls } from "@/lib/billing-portal";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to view billing." }, { status: 401, headers });
  try {
    const db = createServerDatabase();
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const [subscriptions, audits] = await Promise.all([
      db.from("subscriptions").select("id,user_id,plan,plan_name,status,cancelled,ends_at,renews_at,current_period_end,test_mode,customer_portal_url,update_payment_method_url,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50),
      db.from("audits").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", monthStart.toISOString()),
    ]);
    if (subscriptions.error || audits.error) throw new Error("Billing data is unavailable. Apply the latest billing migration.");
    const rows = subscriptions.data ?? [];
    const paid = rows.filter(row => row.plan !== "pro_beta");
    const active = paid.find(row => grantsProAccess(row));
    const selected = active ?? paid[0] ?? null;
    const beta = rows.find(row => row.plan === "pro_beta" && grantsProAccess(row));
    const current = active ?? beta ?? selected;
    const tier = active ? planTier(active.plan_name ?? active.plan, true) : beta ? planTier(beta.plan, true) : "free_audit";
    let urls: { customerPortalUrl: string | null; updatePaymentMethodUrl: string | null } = { customerPortalUrl: null, updatePaymentMethodUrl: null };
    if (selected) {
      try { urls = await freshBillingUrls(selected); } catch { /* Show status even if the provider portal is unavailable. */ }
    }
    return Response.json({
      plan: active ? (active.plan_name ?? (active.plan === "agency" ? "agency" : active.plan === "growth" ? "growth" : "starter")) : beta ? "starter" : "free",
      status: current?.status ?? "free",
      active: !!active || !!beta,
      hasSubscription: !!selected,
      renewsAt: active?.renews_at ?? null,
      endsAt: current?.ends_at ?? (beta?.current_period_end ?? null),
      testMode: active?.test_mode === true,
      customerPortalUrl: urls.customerPortalUrl,
      updatePaymentMethodUrl: urls.updatePaymentMethodUrl,
      quotaUsage: { auditsThisMonth: audits.count ?? 0, monthlyAuditLimit: PLAN_TIERS[tier].monthlyAudits },
    }, { headers });
  } catch {
    return Response.json({ error: "Billing status is temporarily unavailable. Apply the latest billing migration." }, { status: 503, headers });
  }
}
