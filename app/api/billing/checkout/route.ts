import { auth, currentUser } from "@clerk/nextjs/server";
import { BillingConfigError, BillingProviderError, createBillingCheckout, productForTier, type BillingTier, isBillingEnabled } from "@/lib/billing-checkout";
import { createServerDatabase } from "@/lib/supabase-server";
import { grantsProAccess } from "@/lib/subscription";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { canWorkspace } from "@/lib/rbac";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  return Response.json({ error: "Use POST /api/billing/checkout to start a paid checkout." }, { status: 405, headers: { ...headers, Allow: "POST" } });
}

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof auth>>;
  try { session = await auth(); }
  catch { return Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 503, headers }); }
  if (!session.userId) return Response.json({ error: "Sign in before upgrading." }, { status: 401, headers });
  let body: { tier?: unknown; productId?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Send a valid JSON checkout request." }, { status: 400, headers }); }
  if (body?.tier !== "pilot" && body?.tier !== "growth" && body?.tier !== "agency") {
    return Response.json({ error: "Choose Pilot, Growth, or Agency." }, { status: 400, headers });
  }
  const tier = body.tier as BillingTier;
  if (!isBillingEnabled()) return Response.json({ error: "Paid checkout is not enabled yet." }, { status: 503, headers });
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    if (!canWorkspace(access.role, "manage_integrations")) return Response.json({ error: "Workspace administrator access is required for billing." }, { status: 403, headers });
    const ownerUserId = access.ownerUserIds[0];
    const workspaceId = access.organizationId ?? ownerUserId;
    const productId = productForTier(tier);
    if (body.productId !== undefined && String(body.productId) !== productId) {
      return Response.json({ error: "The requested product does not match this plan." }, { status: 400, headers });
    }
    const user = await currentUser();
    const email = user?.emailAddresses.find(item => item.id === user.primaryEmailAddressId)?.emailAddress;
    if (!user || user.id !== session.userId || !email) return Response.json({ error: "Your Clerk account needs a primary email before checkout." }, { status: 400, headers });
    const { data: subscriptions, error: lookupError } = await db.from("subscriptions")
      .select("workspace_id,plan,status,cancelled,ends_at,test_mode").eq("user_id", ownerUserId).limit(100);
    if (lookupError) return Response.json({ error: "Could not verify your current subscription." }, { status: 503, headers });
    if ((subscriptions ?? []).some(item => item.plan !== "pro_beta" && item.workspace_id === workspaceId && grantsProAccess(item))) {
      return Response.json({ error: "Manage your current paid subscription before starting another checkout." }, { status: 409, headers });
    }
    const checkoutUrl = await createBillingCheckout(tier, ownerUserId, email, workspaceId);
    return Response.json({ checkoutUrl, testMode: process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" }, { headers });
  } catch (error) {
    if (error instanceof BillingConfigError) return Response.json({ error: error.message }, { status: 503, headers });
    return Response.json({ error: error instanceof BillingProviderError ? error.message : "Checkout is temporarily unavailable." }, { status: 502, headers });
  }
}
