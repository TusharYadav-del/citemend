import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { parseFounderAllowlist } from "@/lib/founder-os";
import { readRequestJson } from "@/lib/read-request-json";
import { isSuppressed } from "@/lib/outreach/suppression";
import {
  canFounderApproveDraft,
  normalizeSendingDomain,
  normalizeSuppressionEmail,
  parseDeliverabilityChecklist,
} from "@/lib/outreach/workbench";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const MAX_BODY = 12_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function founderId(): Promise<string | null> {
  const { userId } = await auth();
  return userId && parseFounderAllowlist().includes(userId) ? userId : null;
}

export async function GET() {
  if (!await founderId()) return json({ error: "Founder access required." }, 403);
  try {
    const db = createServerDatabase();
    const [settings, prospects, emails, runs, suppressions, replies] = await Promise.all([
      db.from("outreach_settings").select("*").eq("id", 1).single(),
      db.from("outreach_prospects").select("id,domain,company_name,qualification_score,status,category,researched_at").order("discovered_at", { ascending: false }).limit(100),
      db.from("outreach_emails").select("id,recipient,subject,status,sent_at,prospect_id,body_text,factuality_report,founder_review_decision,founder_reviewed_at,founder_reviewed_by").order("created_at", { ascending: false }).limit(50),
      db.from("outreach_daily_runs").select("*").order("run_date", { ascending: false }).limit(10),
      db.from("outreach_suppressions").select("id,email,domain,reason,source,created_at").order("created_at", { ascending: false }).limit(200),
      db.from("outreach_events").select("id,email_id,prospect_id,payload,occurred_at").eq("event_type", "reply").order("occurred_at", { ascending: false }).limit(50),
    ]);
    if ([settings, prospects, emails, runs, suppressions, replies].some(result => result.error) || !settings.data) throw new Error();
    const row = settings.data;
    const enabled = row.outreach_enabled_override ?? (row.outreach_enabled || process.env.OUTREACH_ENABLED?.toLowerCase() === "true");
    return json({
      settings: { ...row, outreach_enabled: enabled },
      outboundEmailsEnabled: process.env.OUTBOUND_EMAILS_ENABLED === "true",
      prospects: prospects.data,
      emails: emails.data,
      runs: runs.data,
      suppressions: suppressions.data,
      replies: replies.data,
    });
  } catch {
    return json({ error: "Outreach data is unavailable. Apply migrations 035, 037, and 041 first." }, 503);
  }
}

export async function PATCH(request: Request) {
  const userId = await founderId();
  if (!userId) return json({ error: "Founder access required." }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not allowed." }, 403);
  const parsed = await readRequestJson(request, MAX_BODY);
  if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return json({ error: "Provide a valid outreach workbench action." }, parsed.kind === "too_large" ? 413 : 400);
  }
  const body = parsed.value as Record<string, unknown>;
  const db = createServerDatabase();

  if (body.action === "save_deliverability") {
    const domain = normalizeSendingDomain(body.domain);
    const checklist = parseDeliverabilityChecklist(body.checklist);
    if (!domain || !checklist) return json({ error: "Enter a public sending domain and the complete deliverability checklist." }, 400);
    const result = await db.from("outreach_settings").update({
      deliverability_domain: domain,
      deliverability_checklist: checklist,
      deliverability_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (result.error) return json({ error: "Deliverability readiness could not be saved. Apply migration 041 first." }, 503);
    return json({ saved: true, domain, checklist });
  }

  if (body.action === "review_draft") {
    const emailId = typeof body.emailId === "string" && UUID.test(body.emailId) ? body.emailId : null;
    const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
    if (!emailId || !decision) return json({ error: "Choose a valid draft and review decision." }, 400);

    const { data: email, error: emailError } = await db.from("outreach_emails")
      .select("id,recipient,status,factuality_report,founder_review_decision")
      .eq("id", emailId).maybeSingle();
    if (emailError) return json({ error: "Draft review is unavailable. Apply migration 041 first." }, 503);
    if (!email) return json({ error: "Draft not found." }, 404);
    if (email.status !== "draft_locked" || email.founder_review_decision) return json({ error: "This draft has already been reviewed or is no longer reviewable." }, 409);

    if (decision === "approved") {
      if (process.env.OUTBOUND_EMAILS_ENABLED !== "true") return json({ error: "Prospect approval is locked until OUTBOUND_EMAILS_ENABLED is explicitly true." }, 423);
      const { data: settings, error: settingsError } = await db.from("outreach_settings")
        .select("deliverability_domain,deliverability_checklist").eq("id", 1).maybeSingle();
      if (settingsError || !settings) return json({ error: "Deliverability readiness is unavailable." }, 503);
      let suppressed: boolean;
      try { suppressed = await isSuppressed(db, email.recipient); }
      catch { return json({ error: "Suppression status could not be verified." }, 503); }
      if (!canFounderApproveDraft({ outboundEnabled: true, sendingDomain: settings.deliverability_domain, checklist: settings.deliverability_checklist, status: email.status, suppressed, factualityReport: email.factuality_report })) {
        return json({ error: suppressed ? "This recipient is suppressed." : "The checklist or verified one-example factuality checks are incomplete." }, 409);
      }
    }

    const reviewedAt = new Date().toISOString();
    const factualityReport = {
      ...(email.factuality_report && typeof email.factuality_report === "object" && !Array.isArray(email.factuality_report) ? email.factuality_report : {}),
      founderReview: { decision, reviewerUserId: userId, reviewedAt },
    };
    const updated = await db.from("outreach_emails").update({
      status: decision === "approved" ? "draft" : "draft_rejected",
      founder_review_decision: decision,
      founder_reviewed_at: reviewedAt,
      founder_reviewed_by: userId,
      factuality_report: factualityReport,
    }).eq("id", emailId).eq("status", "draft_locked").is("founder_review_decision", null).select("id").maybeSingle();
    if (updated.error) return json({ error: "Founder review could not be saved." }, 503);
    if (!updated.data) return json({ error: "This draft changed while it was being reviewed. Refresh and try again." }, 409);
    return json({ reviewed: true, decision, sent: false });
  }

  if (body.action === "add_suppression") {
    const email = normalizeSuppressionEmail(body.email);
    if (!email) return json({ error: "Enter a valid email address to suppress." }, 400);
    const domain = email.split("@").at(-1)!;
    const saved = await db.from("outreach_suppressions").upsert({ email, domain, reason: "founder_manual", source: "founder_manual" }, { onConflict: "email", ignoreDuplicates: true });
    if (saved.error) return json({ error: "The suppression could not be recorded." }, 503);
    const drafts = await db.from("outreach_emails").update({ status: "unsubscribed" }).eq("recipient", email).in("status", ["draft_locked", "draft", "queued"]);
    if (drafts.error) return json({ error: "Suppression saved, but existing draft states could not be updated. Do not use any draft for this address." }, 503);
    return json({ suppressed: true, email });
  }

  const updates: { outreach_enabled?: boolean; outreach_enabled_override?: boolean | null; kill_switch?: boolean; daily_target?: number; daily_send_limit?: number; min_qualification_score?: number } = {};
  if (typeof body.outreach_enabled === "boolean") { updates.outreach_enabled = body.outreach_enabled; updates.outreach_enabled_override = body.outreach_enabled; }
  if (typeof body.kill_switch === "boolean") updates.kill_switch = body.kill_switch;
  if (typeof body.daily_target === "number" && Number.isInteger(body.daily_target) && body.daily_target >= 0 && body.daily_target <= 100) updates.daily_target = body.daily_target;
  if (typeof body.daily_send_limit === "number" && Number.isInteger(body.daily_send_limit) && body.daily_send_limit >= 0 && body.daily_send_limit <= 100) updates.daily_send_limit = body.daily_send_limit;
  if (typeof body.min_qualification_score === "number" && Number.isInteger(body.min_qualification_score) && body.min_qualification_score >= 0 && body.min_qualification_score <= 100) updates.min_qualification_score = body.min_qualification_score;
  if (body.pause_campaign === true || body.pause_campaign === false) {
    const result = await db.from("outreach_campaigns").update({ status: body.pause_campaign ? "paused" : "active" }).eq("status", body.pause_campaign ? "active" : "paused");
    if (result.error) return json({ error: "Campaign state could not be updated." }, 503);
  }
  if (!Object.keys(updates).length) return json({ updated: true });
  const { data, error } = await db.from("outreach_settings").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", 1).select("*").single();
  if (error) return json({ error: "Settings could not be updated." }, 503);
  return json({ settings: data });
}
