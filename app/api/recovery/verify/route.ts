import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { verifyDeployedRedirect } from "@/lib/recovery/verify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  let userId: string | null;
  try { userId = (await auth()).userId; }
  catch { return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503, headers }); }
  if (!userId) return Response.json({ error: "Sign in to verify redirects." }, { status: 401, headers });
  const input = await request.json().catch(() => null) as { domain?: unknown; findingId?: unknown } | null;
  if (!input || typeof input.domain !== "string" || typeof input.findingId !== "string" || !UUID.test(input.findingId)) return Response.json({ error: "Provide a valid domain and finding ID." }, { status: 400, headers });
  let domain: string;
  try { domain = normalizeDashboardDomain(input.domain); } catch { return Response.json({ error: "Provide a valid domain." }, { status: 400, headers }); }
  try {
    const db = createServerDatabase();
    const audits = await db.from("audits").select("id").eq("user_id", userId).eq("domain", domain).limit(500);
    if (audits.error) throw audits.error;
    const ids = (audits.data ?? []).map(row => row.id);
    if (!ids.length) return Response.json({ error: "This domain is not associated with your account." }, { status: 404, headers });
    const result = await db.from("recovery_findings").select("id,domain,finding_type,normalized_path,guardrail_classification,approval_status,suggested_target_url").eq("id", input.findingId).in("audit_id", ids).maybeSingle();
    if (result.error) throw result.error;
    const finding = result.data;
    if (!finding || finding.domain !== domain) return Response.json({ error: "Recovery finding was not found in this workspace." }, { status: 404, headers });
    if (finding.finding_type !== "dead_url" || !["approved", "deployed"].includes(finding.approval_status) || finding.guardrail_classification !== "recoverable_equivalent" || !finding.suggested_target_url) return Response.json({ error: "Only approved or deployed recovery findings can be verified." }, { status: 409, headers });
    const path = finding.normalized_path.startsWith("/") ? finding.normalized_path : `/${finding.normalized_path}`;
    const verification = await verifyDeployedRedirect(`https://${domain}${path}`, finding.suggested_target_url, domain);
    return Response.json(verification, { status: verification.ok ? 200 : 422, headers });
  } catch { return Response.json({ error: "Live redirect verification is temporarily unavailable." }, { status: 503, headers }); }
}
