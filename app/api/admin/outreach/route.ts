import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { parseFounderAllowlist } from "@/lib/founder-os";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function allowed() { const { userId } = await auth(); return userId && parseFounderAllowlist().includes(userId); }
export async function GET() {
  if (!await allowed()) return json({ error: "Founder access required." }, 403);
  try { const db = createServerDatabase(); const [settings, prospects, emails, runs, suppressions, replies] = await Promise.all([db.from("outreach_settings").select("*").eq("id",1).single(), db.from("outreach_prospects").select("id,domain,company_name,qualification_score,status,category,researched_at").order("discovered_at",{ascending:false}).limit(100), db.from("outreach_emails").select("id,recipient,subject,status,sent_at,prospect_id,body_text,factuality_report").order("created_at",{ascending:false}).limit(50), db.from("outreach_daily_runs").select("*").order("run_date",{ascending:false}).limit(10), db.from("outreach_suppressions").select("id,email,reason,source,created_at").order("created_at",{ascending:false}).limit(100), db.from("outreach_events").select("id,email_id,prospect_id,payload,occurred_at").eq("event_type","reply").order("occurred_at",{ascending:false}).limit(50)]); if ([settings,prospects,emails,runs,suppressions,replies].some(x=>x.error) || !settings.data) throw new Error(); const row=settings.data; const enabled=row.outreach_enabled_override??(row.outreach_enabled||process.env.OUTREACH_ENABLED?.toLowerCase()==="true"); return json({ settings:{...row,outreach_enabled:enabled},prospects:prospects.data,emails:emails.data,runs:runs.data,suppressions:suppressions.data,replies:replies.data }); }
  catch { return json({ error: "Outreach data is unavailable. Apply migration 035 first." }, 503); }
}
export async function PATCH(request: Request) {
  if (!await allowed()) return json({ error: "Founder access required." }, 403);
  let parsed: unknown; try { parsed = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "Invalid settings payload." }, 400);
  const body = parsed as Record<string, unknown>;
  const updates: { outreach_enabled?: boolean; outreach_enabled_override?: boolean | null; kill_switch?: boolean; daily_target?: number; daily_send_limit?: number; min_qualification_score?: number } = {};
  if (typeof body.outreach_enabled === "boolean") { updates.outreach_enabled = body.outreach_enabled; updates.outreach_enabled_override = body.outreach_enabled; }
  if (typeof body.kill_switch === "boolean") updates.kill_switch = body.kill_switch;
  if (typeof body.daily_target === "number" && Number.isInteger(body.daily_target) && body.daily_target >= 0 && body.daily_target <= 100) updates.daily_target = body.daily_target;
  if (typeof body.daily_send_limit === "number" && Number.isInteger(body.daily_send_limit) && body.daily_send_limit >= 0 && body.daily_send_limit <= 100) updates.daily_send_limit = body.daily_send_limit;
  if (typeof body.min_qualification_score === "number" && Number.isInteger(body.min_qualification_score) && body.min_qualification_score >= 0 && body.min_qualification_score <= 100) updates.min_qualification_score = body.min_qualification_score;
  try { const db = createServerDatabase(); if (body.pause_campaign === true) { const result = await db.from("outreach_campaigns").update({ status: "paused" }).eq("status", "active"); if(result.error) throw result.error; } if (body.pause_campaign === false) { const result = await db.from("outreach_campaigns").update({ status: "active" }).eq("status", "paused"); if(result.error) throw result.error; } if (!Object.keys(updates).length) return json({ updated: true }); const { data,error } = await db.from("outreach_settings").update({ ...updates,updated_at:new Date().toISOString() }).eq("id",1).select("*").single(); if(error) throw error; return json({ settings:data }); }
  catch { return json({ error: "Settings could not be updated." }, 503); }
}
