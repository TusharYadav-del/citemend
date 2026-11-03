import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { hasProSubscription } from "@/lib/subscription";
import { generateHijackPitch, type PitchKind } from "@/lib/hijack-pitch";
import { readRequestJson } from "@/lib/read-request-json";

const privateHeaders = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = new Set<PitchKind>(["competitor_direct_404", "listicle_outbound_404", "listicle_missing_brand", "reddit_citation_thread"]);

export async function POST(request: Request) {
  let userId: string | null;
  try { userId = (await auth()).userId; }
  catch { return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503, headers: privateHeaders }); }
  if (!userId) return Response.json({ error: "Sign in to draft an outreach message." }, { status: 401, headers: privateHeaders });
  const parsed = await readRequestJson(request, 4096);
  if (parsed.kind === "too_large") return Response.json({ error: "Request body exceeds 4 KiB." }, { status: 413, headers: privateHeaders });
  if (parsed.kind !== "ok") return Response.json({ error: "Send a valid JSON request." }, { status: 400, headers: privateHeaders });
  const body = parsed.value;
  const opportunityId = body && typeof body === "object" ? (body as { opportunityId?: unknown }).opportunityId : null;
  if (typeof opportunityId !== "string" || !UUID.test(opportunityId)) return Response.json({ error: "Provide a valid opportunityId." }, { status: 400, headers: privateHeaders });
  try {
    const db = createServerDatabase();
    const { data: row, error } = await db.from("citation_hijack_opportunities")
      .select("id,audit_id,domain,opportunity_type,prompt_query,target_url,dead_competitor_url,matched_user_live_url,audits!inner(user_id)")
      .eq("id", opportunityId).eq("audits.user_id", userId).maybeSingle();
    if (error) throw error;
    if (!row || !row.audit_id || !kinds.has(row.opportunity_type as PitchKind)) return Response.json({ error: "Opportunity not found." }, { status: 404, headers: privateHeaders });
    const { data: siblings, error: siblingsError } = await db.from("citation_hijack_opportunities").select("id")
      .eq("audit_id", row.audit_id).order("created_at", { ascending: true }).order("id", { ascending: true });
    if (siblingsError) throw siblingsError;
    const position = (siblings ?? []).findIndex(item => item.id === opportunityId);
    if (position < 0) return Response.json({ error: "Opportunity not found." }, { status: 404, headers: privateHeaders });
    if (position >= 2 && !(await hasProSubscription(userId))) return Response.json({ error: "Upgrade to Pro to draft outreach for this opportunity.", code: "PRO_REQUIRED" }, { status: 403, headers: privateHeaders });
    const draft = await generateHijackPitch({ opportunityId, kind: row.opportunity_type as PitchKind, domain: row.domain, prompt: row.prompt_query, targetUrl: row.target_url, deadUrl: row.dead_competitor_url, matchedUrl: row.matched_user_live_url });
    const { error: saveError } = await db.from("citation_hijack_opportunities").update({ outreach_draft: draft }).eq("id", opportunityId);
    if (saveError) throw saveError;
    return Response.json({ opportunityId, outreachDraft: draft }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "The outreach draft could not be generated or saved. Please retry." }, { status: 503, headers: privateHeaders });
  }
}
