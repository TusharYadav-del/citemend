import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { canWorkspace } from "@/lib/rbac";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { getAgencyReferralCookie } from "@/lib/agency-referrals";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const code = getAgencyReferralCookie(request);
  if (!code) return json({ converted: false });
  const session = await auth();
  if (!session.userId) return json({ error: "Sign in required." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Provide a workspace domain." }, 400); }
  const rawDomain = body && typeof body === "object" ? (body as Record<string, unknown>).domain : null;
  if (typeof rawDomain !== "string") return json({ error: "Provide a valid workspace domain." }, 400);
  let domain: string;
  try { domain = normalizeDashboardDomain(rawDomain); } catch { return json({ error: "Provide a valid workspace domain." }, 400); }
  const db = createServerDatabase();
  try {
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    if (!canWorkspace(access.role, "invite_members")) return json({ error: "Owner or admin access is required." }, 403);
    const owned = await db.from("audits").select("id").in("user_id", access.ownerUserIds).eq("domain", domain).limit(1);
    if (owned.error || !owned.data?.length) return json({ error: "Workspace not found." }, 404);
    const referral = await db.from("agency_referrals").select("id,referrer_user_id").eq("referral_code", code).neq("status", "expired").maybeSingle();
    if (referral.error || !referral.data || referral.data.referrer_user_id === access.ownerUserIds[0]) return json({ converted: false }, 404);
    const saved = await db.from("agency_referrals").update({ status: "qualified", referred_workspace_domain: domain, referred_workspace_user_id: access.ownerUserIds[0], converted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", referral.data.id).is("referred_workspace_user_id", null).select("id").maybeSingle();
    if (saved.error) return json({ error: "Referral conversion could not be recorded." }, 503);
    return json({ converted: Boolean(saved.data) });
  } catch { return json({ error: "Workspace access could not be verified." }, 403); }
}
