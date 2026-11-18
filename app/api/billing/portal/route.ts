import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { createBillingPortalSession } from "@/lib/billing-portal";
import { isBillingEnabled } from "@/lib/billing-checkout";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to manage billing." }, { status: 401, headers });
  if (!isBillingEnabled()) return Response.json({ error: "Paid billing is not enabled yet." }, { status: 503, headers });
  let action: unknown;
  try { action = (await request.json()).action; }
  catch { return Response.json({ error: "Choose a billing action." }, { status: 400, headers }); }
  if (action !== "manage" && action !== "payment") return Response.json({ error: "Choose manage or payment." }, { status: 400, headers });
  try {
    const db = createServerDatabase();
    const { data, error } = await db.from("subscriptions")
      .select("id,user_id,plan,customer_id,billing_provider")
      .eq("user_id", userId).eq("billing_provider", "dodo").order("updated_at", { ascending: false }).limit(50);
    if (error) throw error;
    const selected = (data ?? []).find(row => row.plan !== "pro_beta");
    if (!selected) return Response.json({ error: "No paid subscription was found." }, { status: 404, headers });
    if (!selected.customer_id) return Response.json({ error: "No Dodo customer was found for this subscription." }, { status: 404, headers });
    const url = await createBillingPortalSession(selected.customer_id, userId);
    return Response.json({ url }, { headers });
  } catch {
    return Response.json({ error: "The billing portal is temporarily unavailable." }, { status: 503, headers });
  }
}
