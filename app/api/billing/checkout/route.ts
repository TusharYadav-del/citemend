import { auth, currentUser } from "@clerk/nextjs/server";
import { BillingConfigError, BillingProviderError, createBillingCheckout, type BillingTier, variantForTier } from "@/lib/billing-checkout";
import { createServerDatabase } from "@/lib/supabase-server";
import { grantsProAccess } from "@/lib/subscription";
import { isBillingEnabled } from "@/lib/lemonsqueezy";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  let userId: string | null;
  try { userId = (await auth()).userId; }
  catch { return Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 503, headers }); }
  if (!userId) return Response.json({ error: "Sign in before upgrading." }, { status: 401, headers });
  let body: { tier?: unknown; variantId?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Send a valid JSON checkout request." }, { status: 400, headers }); }
  if (body?.tier !== "starter" && body?.tier !== "growth" && body?.tier !== "agency") {
    return Response.json({ error: "Choose Starter, Growth, or Agency." }, { status: 400, headers });
  }
  const tier = body.tier as BillingTier;
  if (!isBillingEnabled()) return Response.json({ error: "Paid checkout is not enabled yet." }, { status: 503, headers });
  try {
    const variant = variantForTier(tier);
    if (body.variantId !== undefined && String(body.variantId) !== variant) {
      return Response.json({ error: "The requested variant does not match this plan." }, { status: 400, headers });
    }
    const user = await currentUser();
    const email = user?.emailAddresses.find(item => item.id === user.primaryEmailAddressId)?.emailAddress;
    if (!user || user.id !== userId || !email) return Response.json({ error: "Your Clerk account needs a primary email before checkout." }, { status: 400, headers });
    const { data: subscriptions, error: lookupError } = await createServerDatabase().from("subscriptions")
      .select("plan,status,cancelled,ends_at,test_mode").eq("user_id", userId).limit(50);
    if (lookupError) return Response.json({ error: "Could not verify your current subscription." }, { status: 503, headers });
    if ((subscriptions ?? []).some(item => item.plan !== "pro_beta" && grantsProAccess(item))) {
      return Response.json({ error: "Manage your current paid subscription before starting another checkout." }, { status: 409, headers });
    }
    const checkoutUrl = await createBillingCheckout(tier, userId, email);
    return Response.json({ checkoutUrl, testMode: process.env.LEMON_SQUEEZY_TEST_MODE === "true" }, { headers });
  } catch (error) {
    if (error instanceof BillingConfigError) return Response.json({ error: error.message }, { status: 503, headers });
    return Response.json({ error: error instanceof BillingProviderError ? error.message : "Checkout is temporarily unavailable." }, { status: 502, headers });
  }
}
