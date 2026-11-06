import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { readRequestJson } from "@/lib/read-request-json";
import { comparePageEntities, fetchCorePage } from "@/lib/entity-consistency";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";

const UUID = /^[0-9a-f-]{36}$/i;
export async function POST(request: Request) {
  const { userId, orgId, orgRole } = await auth(); if (!userId) return Response.json({ error: "Sign in to inspect an owned workspace." }, { status: 401 });
  const parsed = await readRequestJson(request, 8192); if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object") return Response.json({ error: "Provide a valid audit ID." }, { status: 400 });
  const input = parsed.value as Record<string, unknown>; if (typeof input.auditId !== "string" || !UUID.test(input.auditId)) return Response.json({ error: "Provide a valid audit ID." }, { status: 400 });
  const db = createServerDatabase();
  try {
    const access=await resolveWorkspaceAccess(db,userId,orgId??null,orgRole); const audit = await db.from("audits").select("id,domain,buyer_prompt").eq("id", input.auditId).in("user_id", access.ownerUserIds).maybeSingle();
    if (audit.error) throw audit.error; if (!audit.data) return Response.json({ error: "Audit not found." }, { status: 404 });
    const [homepage, pricing, product, docs, observations] = await Promise.all([
      fetchCorePage(audit.data.domain, "homepage"), fetchCorePage(audit.data.domain, "pricing"), fetchCorePage(audit.data.domain, "product"), fetchCorePage(audit.data.domain, "docs"),
      db.from("ai_observation_evidence").select("raw_answer,extracted_urls_json,observed_at").eq("audit_id", audit.data.id).order("observed_at", { ascending: false }).limit(10),
    ]);
    if (observations.error) throw observations.error;
    const answers = (observations.data ?? []).map(item => item.raw_answer).join("\n");
    return Response.json(comparePageEntities([homepage, pricing, product, docs].filter(page => page.state === "200"), answers), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Entity consistency analysis is unavailable. Apply migrations 022 and 023." }, { status: 503 }); }
}
