import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { canWorkspace } from "@/lib/rbac";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { createAgencyReferralCode } from "@/lib/agency-referrals";
import { readRequestJson } from "@/lib/read-request-json";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

async function accessFor(request: Request) {
  const session = await auth();
  if (!session.userId) return { response: json({ error: "Sign in to manage agency referrals." }, 401) } as const;
  let domain: string;
  try { domain = normalizeDashboardDomain(new URL(request.url).searchParams.get("domain") ?? ""); }
  catch { return { response: json({ error: "Provide a valid workspace domain." }, 400) } as const; }
  const db = createServerDatabase();
  try {
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    if (!canWorkspace(access.role, "invite_members")) return { response: json({ error: "Owner or admin access is required." }, 403) } as const;
    const audit = await db.from("audits").select("id").in("user_id", access.ownerUserIds).eq("domain", domain).limit(1);
    if (audit.error) return { response: json({ error: "Workspace access could not be verified." }, 503) } as const;
    if (!audit.data?.length) return { response: json({ error: "Workspace not found." }, 404) } as const;
    return { db, session, access, domain } as const;
  } catch { return { response: json({ error: "Workspace access could not be verified." }, 403) } as const; }
}

export async function GET(request: Request) {
  const context = await accessFor(request);
  if ("response" in context) return context.response;
  const { data, error } = await context.db.from("agency_referrals")
    .select("id,referral_code,status,visit_count,partner_application_id,referred_workspace_domain,converted_at,created_at")
    .eq("referrer_user_id", context.access.ownerUserIds[0])
    .eq("referrer_workspace_domain", context.domain)
    .order("created_at", { ascending: false }).limit(100);
  return error ? json({ error: "Referral links are temporarily unavailable." }, 503) : json({ referrals: data ?? [] });
}

export async function POST(request: Request) {
  const context = await accessFor(request);
  if ("response" in context) return context.response;
  const parsed = await readRequestJson(request, 2048);
  if (parsed.kind !== "ok") return json({ error: "Provide a valid JSON request." }, 400);
  // Accepting only a small optional label keeps the stored referral free of arbitrary content.
  const label = parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value)
    ? (parsed.value as Record<string, unknown>).label : undefined;
  if (label !== undefined && (typeof label !== "string" || label.trim().length > 80)) return json({ error: "Partner label must be 80 characters or fewer." }, 400);
  const code = createAgencyReferralCode();
  const { data, error } = await context.db.from("agency_referrals").insert({
    referrer_user_id: context.access.ownerUserIds[0],
    referrer_workspace_domain: context.domain,
    referral_code: code,
  }).select("id,referral_code,status,visit_count,created_at").single();
  return error ? json({ error: "Referral link could not be created." }, 503) : json({ referral: data, label: typeof label === "string" ? label.trim() : "" }, 201);
}
