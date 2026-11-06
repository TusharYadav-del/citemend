import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { getWorkspaceOperatingMetrics, validFounderMetricsAuthorization } from "@/lib/operating-metrics";

const privateHeaders = { "Cache-Control": "private, no-store" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: privateHeaders });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope");
  const db = createServerDatabase();
  if (scope === "founder") {
    if (!validFounderMetricsAuthorization(request.headers.get("authorization"))) return json({ error: "Founder metrics authorization is required." }, 401);
    try {
      const baselines = await db.from("workspace_operating_metrics").select("user_id").limit(5000);
      if (baselines.error) throw baselines.error;
      const ownerIds = [...new Set((baselines.data ?? []).map((row) => row.user_id))];
      const memberships = ownerIds.length ? await db.from("organization_members").select("member_user_id").in("owner_user_id", ownerIds).limit(10000) : { data: [], error: null };
      if (memberships.error) throw memberships.error;
      const actors = [...new Set([...ownerIds, ...(memberships.data ?? []).map((row) => row.member_user_id)])];
      const all = ownerIds.length ? await getWorkspaceOperatingMetrics(db, ownerIds, null, actors) : { workspaces: [], founder: { total_workspaces: 0, activated_workspaces: 0, customer_activation_rate_percent: null } };
      const metrics = all.workspaces.map((item) => item.metrics);
      const mean = (values: (number | null)[]) => { const valid = values.filter((value): value is number => value !== null && Number.isFinite(value)); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null; };
      return json({ scope: "founder_aggregate", ...all.founder, mean_time_to_first_useful_audit_minutes: mean(metrics.map((item) => item.time_to_first_useful_audit_minutes)), mean_time_to_first_recovery_action_minutes: mean(metrics.map((item) => item.time_to_first_recovery_action_minutes)), mean_redirect_deployment_verification_rate_percent: mean(metrics.map((item) => item.redirect_deployment_verification_rate_percent)), mean_evidence_completeness_rate_percent: mean(metrics.map((item) => item.evidence_completeness_rate_percent)), measurement_note: "Aggregate only; individual workspace names, domains, and rows are not returned." });
    } catch { return json({ error: "Founder operating metrics are temporarily unavailable." }, 503); }
  }

  const session = await auth();
  if (!session.userId) return json({ error: "Sign in to view operating metrics." }, 401);
  const requestedDomain = params.get("domain");
  try {
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    let actors = [...new Set([...access.ownerUserIds, session.userId])];
    if (access.organizationId) {
      const members = await db.from("organization_members").select("member_user_id").eq("organization_id", access.organizationId).eq("owner_user_id", access.ownerUserIds[0]).limit(1000);
      if (members.error) throw members.error;
      actors = [...new Set([...actors, ...(members.data ?? []).map((row) => row.member_user_id)])];
    }
    const result = await getWorkspaceOperatingMetrics(db, access.ownerUserIds, requestedDomain, actors);
    if (requestedDomain && !result.workspaces.some((item) => item.domain === requestedDomain)) return json({ error: "Workspace domain not found." }, 404);
    return json({ scope: "workspace", ...result });
  } catch { return json({ error: "Workspace operating metrics are temporarily unavailable." }, 503); }
}
