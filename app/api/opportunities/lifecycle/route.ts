import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { readRequestJson } from "@/lib/read-request-json";
import { advanceOpportunityStage, appendStageEvent, compositePriorityScore, type OpportunitySignals, type OpportunityStage } from "@/lib/opportunity-lifecycle";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  let userId: string | null;
  try { userId = (await auth()).userId; } catch { return json({ error: "Authentication is temporarily unavailable." }, 503); }
  if (!userId) return json({ error: "Sign in to update this opportunity." }, 401);
  const origin = request.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).origin !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not allowed." }, 403); }
    catch { return json({ error: "Invalid request origin." }, 403); }
  }
  const parsed = await readRequestJson(request, 4096);
  if (parsed.kind === "too_large") return json({ error: "Request body exceeds 4 KiB." }, 413);
  if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return json({ error: "Send a valid JSON request." }, 400);
  const input = parsed.value as Record<string, unknown>;
  if (typeof input.opportunityId !== "string" || !UUID.test(input.opportunityId) || typeof input.stage !== "string" || (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 1000))) return json({ error: "Provide an opportunity ID, next stage, and a note up to 1,000 characters." }, 400);
  const note = typeof input.note === "string" ? input.note.trim() : "";
  try {
    const db = createServerDatabase();
    const result = await db.from("citation_hijack_opportunities")
      .select("id,audit_id,domain,lifecycle_stage,stage_history_json,relevance_score,buyer_intent_score,citation_evidence_score,replacement_quality_score,audits!inner(user_id)")
      .eq("id", input.opportunityId).eq("audits.user_id", userId).maybeSingle();
    if (result.error) throw result.error;
    const item = result.data as unknown as ({ id: string; audit_id: string; domain: string; lifecycle_stage: string; stage_history_json: unknown } & OpportunitySignals & { audits: { user_id: string } | { user_id: string }[] }) | null;
    if (!item) return json({ error: "Opportunity not found." }, 404);
    if (!advanceOpportunityStage(item.lifecycle_stage, input.stage)) return json({ error: "Move opportunities one stage at a time through the lifecycle." }, 409);
    const stage = input.stage as OpportunityStage;
    const at = new Date().toISOString();
    const history = appendStageEvent(item.stage_history_json, { stage, at, actor_user_id: userId, note });
    const composite = compositePriorityScore(item);
    const update = await db.from("citation_hijack_opportunities").update({ lifecycle_stage: stage, stage_history_json: history, composite_priority_score: composite })
      .eq("id", item.id).eq("audit_id", item.audit_id).eq("lifecycle_stage", item.lifecycle_stage).select("id").maybeSingle();
    if (update.error) throw update.error;
    if (!update.data) return json({ error: "This opportunity changed in another session. Reload before advancing it again." }, 409);
    return json({ opportunityId: item.id, stage, at, compositePriorityScore: composite, stageHistory: history });
  } catch { return json({ error: "Opportunity lifecycle is temporarily unavailable." }, 503); }
}
