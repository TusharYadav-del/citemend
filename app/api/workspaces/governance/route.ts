import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { canWorkspace, resolveOrganizationRole } from "@/lib/rbac";
import { readRequestJson } from "@/lib/read-request-json";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
type Context = { db: ReturnType<typeof createServerDatabase>; userId: string; ownerId: string; domain: string };
async function workspaceContext(request: Request, action: "read" | "manage_retention" | "export_workspace" | "delete_workspace"): Promise<Context | Response> {
  const session = await auth();
  if (!session.userId) return json({ error: "Sign in required." }, 401);
  let domain: string;
  try { domain = normalizeDashboardDomain(new URL(request.url).searchParams.get("domain") ?? ""); }
  catch { return json({ error: "Provide a valid domain." }, 400); }
  const db = createServerDatabase();
  let ownerId = session.userId;
  let membershipRole: string | null = null;
  if (session.orgId) {
    const membership = await db.from("organization_members").select("owner_user_id,role").eq("organization_id", session.orgId).eq("member_user_id", session.userId).maybeSingle();
    if (!membership.data) return json({ error: "Organization membership is required." }, 403);
    ownerId = membership.data.owner_user_id;
    membershipRole = membership.data.role;
  }
  const audit = await db.from("audits").select("id").eq("user_id", ownerId).eq("domain", domain).limit(1);
  if (audit.error || !audit.data?.length) return json({ error: "Workspace not found." }, 404);
  const role = session.orgId
    ? resolveOrganizationRole(session.orgRole, membershipRole) ?? "viewer"
    : resolveOrganizationRole(session.orgRole) ?? "owner";
  if (!canWorkspace(role, action)) return json({ error: "Insufficient workspace role." }, 403);
  return { db, userId: session.userId, ownerId, domain };
}
function isResponse(value: Context | Response): value is Response { return value instanceof Response; }

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("action") === "export") {
    const context = await workspaceContext(request, "export_workspace"); if (isResponse(context)) return context;
    const exported: Record<string, unknown> = {};
    const audits = await context.db.from("audits").select("*").eq("user_id", context.ownerId).eq("domain", context.domain).limit(10000);
    if (audits.error) return json({ error: "Export failed while reading audits." }, 503);
    exported.audits = audits.data;
    const auditIds = (audits.data ?? []).map(row => row.id);
    for (const table of ["broken_links", "ai_observation_evidence", "recovery_outcomes", "citation_hijack_opportunities"] as const) {
      const result = auditIds.length
        ? await context.db.from(table).select("*").in("audit_id", auditIds).limit(10000)
        : { data: [], error: null };
      if (result.error) return json({ error: `Export failed while reading ${table}.` }, 503);
      exported[table] = result.data;
    }
    // These schemas share select builders but different tenant key columns.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scopedDb = context.db as any;
    for (const [table, domainField] of [["redirect_rules", "source_host"], ["ecommerce_catalog_items", "workspace_domain"], ["scheduled_reports", "workspace_domain"], ["workspace_governance_policies", "workspace_domain"]] as const) {
      const result = await scopedDb.from(table).select("*").eq("user_id", context.ownerId).eq(domainField, context.domain).limit(10000);
      if (result.error) return json({ error: `Export failed while reading ${table}.` }, 503);
      exported[table] = result.data;
    }
    const logged = await context.db.from("action_audit_logs").insert({ workspace_domain: context.domain, actor_user_id: context.userId, action_type: "workspace_export", target_url: null, previous_state_json: {}, new_state_json: { tables: Object.keys(exported).length, exported_at: new Date().toISOString() }, safety_check_passed: true });
    if (logged.error) return json({ error: "Export audit record could not be written." }, 503);
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), workspace: context.domain, data: exported }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="citemend-${context.domain}-export.json"`, "Cache-Control": "private, no-store" } });
  }
  const context = await workspaceContext(request, "read"); if (isResponse(context)) return context;
  const result = await context.db.from("workspace_governance_policies").select("observation_retention_days,require_two_person_redirect_approval,api_rate_limit_per_minute,monthly_scan_quota").eq("user_id", context.ownerId).eq("workspace_domain", context.domain).maybeSingle();
  return result.error ? json({ error: "Policy unavailable." }, 503) : json({ policy: result.data ?? { observation_retention_days: 365, require_two_person_redirect_approval: false, api_rate_limit_per_minute: 60, monthly_scan_quota: 20 } });
}

export async function PATCH(request: Request) {
  const context = await workspaceContext(request, "manage_retention"); if (isResponse(context)) return context;
  const parsed = await readRequestJson(request, 4096);
  if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object") return json({ error: "Provide policy values." }, 400);
  const policy = parsed.value as Record<string, unknown>;
  if (![90, 180, 365].includes(policy.observation_retention_days as number) || typeof policy.require_two_person_redirect_approval !== "boolean" || !Number.isInteger(policy.api_rate_limit_per_minute) || (policy.api_rate_limit_per_minute as number) < 1 || (policy.api_rate_limit_per_minute as number) > 600) return json({ error: "Retention must be 90, 180, or 365 days; rate limit must be 1–600." }, 400);
  const saved = await context.db.from("workspace_governance_policies").upsert({ user_id: context.ownerId, workspace_domain: context.domain, observation_retention_days: policy.observation_retention_days as number, require_two_person_redirect_approval: policy.require_two_person_redirect_approval, api_rate_limit_per_minute: policy.api_rate_limit_per_minute as number }, { onConflict: "user_id,workspace_domain" }).select("observation_retention_days,require_two_person_redirect_approval,api_rate_limit_per_minute").single();
  return saved.error ? json({ error: "Policy could not be saved." }, 503) : json({ policy: saved.data });
}

export async function DELETE(request: Request) {
  const context = await workspaceContext(request, "delete_workspace"); if (isResponse(context)) return context;
  const logged = await context.db.from("action_audit_logs").insert({ workspace_domain: context.domain, actor_user_id: context.userId, action_type: "workspace_delete", target_url: null, previous_state_json: {}, new_state_json: { requested_at: new Date().toISOString() }, safety_check_passed: true });
  if (logged.error) return json({ error: "Deletion audit record could not be written." }, 503);
  // Delete only scoped records; audit children cascade from the owned audit rows.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopedDb = context.db as any;
  for (const [table, domainField] of [["workspace_api_keys", "workspace_domain"], ["ecommerce_catalog_items", "workspace_domain"], ["scheduled_reports", "workspace_domain"], ["workspace_governance_policies", "workspace_domain"], ["citation_change_events", "workspace_domain"], ["autonomous_agent_runs", "workspace_domain"], ["cms_connections", "domain"], ["redirect_rules", "source_host"]] as const) {
    const result = await scopedDb.from(table).delete().eq("user_id", context.ownerId).eq(domainField, context.domain);
    if (result.error) return json({ error: `Deletion paused at ${table}; retry to continue.` }, 503);
  }
  const audits = await context.db.from("audits").delete().eq("user_id", context.ownerId).eq("domain", context.domain);
  return audits.error ? json({ error: "Workspace audit data deletion failed." }, 503) : json({ deleted: true, domain: context.domain });
}
