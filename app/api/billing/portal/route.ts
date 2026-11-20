import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { createBillingPortalSession } from "@/lib/billing-portal";
import { isBillingEnabled } from "@/lib/billing-checkout";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { canWorkspace } from "@/lib/rbac";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof auth>>;
  try { session = await auth(); }
  catch { return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503, headers }); }
  if (!session.userId) return Response.json({ error: "Sign in to manage billing." }, { status: 401, headers });
  if (!isBillingEnabled()) return Response.json({ error: "Paid billing is not enabled yet." }, { status: 503, headers });
  let action: unknown;
  try { action = (await request.json()).action; }
  catch { return Response.json({ error: "Choose a billing action." }, { status: 400, headers }); }
  if (action !== "manage" && action !== "payment") return Response.json({ error: "Choose manage or payment." }, { status: 400, headers });
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    if (!canWorkspace(access.role, "manage_integrations")) return Response.json({ error: "Workspace administrator access is required for billing." }, { status: 403, headers });
    const ownerUserId = access.ownerUserIds[0];
    const workspaceId = access.organizationId ?? ownerUserId;
    const { data, error } = await db.from("subscriptions")
      .select("id,user_id,workspace_id,plan,customer_id,billing_provider")
      .eq("user_id", ownerUserId).eq("workspace_id", workspaceId).eq("billing_provider", "dodo").order("updated_at", { ascending: false }).limit(50);
    if (error) throw error;
    const selected = (data ?? []).find(row => row.plan !== "pro_beta");
    if (!selected) return Response.json({ error: "No paid subscription was found." }, { status: 404, headers });
    if (!selected.customer_id) return Response.json({ error: "No Dodo customer was found for this subscription." }, { status: 404, headers });
    const url = await createBillingPortalSession(selected.customer_id, ownerUserId);
    return Response.json({ url }, { headers });
  } catch {
    return Response.json({ error: "The billing portal is temporarily unavailable." }, { status: 503, headers });
  }
}
