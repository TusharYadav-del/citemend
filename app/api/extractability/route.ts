import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { readRequestJson } from "@/lib/read-request-json";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { runExtractabilityAudit } from "@/lib/extractability-audit";

const UUID = /^[0-9a-f-]{36}$/i;
export async function POST(request: Request) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) return Response.json({ error: "Sign in to scan an owned domain." }, { status: 401 });
  const parsed = await readRequestJson(request, 4096);
  if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object") return Response.json({ error: "Provide a saved audit ID." }, { status: 400 });
  const auditId = (parsed.value as Record<string, unknown>).auditId;
  if (typeof auditId !== "string" || !UUID.test(auditId)) return Response.json({ error: "Provide a valid audit ID." }, { status: 400 });
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, userId, orgId ?? null, orgRole);
    const audit = await db.from("audits").select("id,domain").eq("id", auditId).in("user_id", access.ownerUserIds).maybeSingle();
    if (audit.error) throw audit.error;
    if (!audit.data) return Response.json({ error: "Audit not found." }, { status: 404 });
    const report = await runExtractabilityAudit(audit.data.domain);
    return Response.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "The extractability scan is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
