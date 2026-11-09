import { createServerDatabase } from "@/lib/supabase-server";
import { nextScheduledReportAt } from "@/lib/scheduled-report-cadence";
import { sendEmail } from "@/lib/email-provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function send(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if ((!process.env.BREVO_API_KEY?.trim() && !process.env.RESEND_API_KEY?.trim()) || !(process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim())) return Response.json({ error: "Email delivery is not configured." }, { status: 503 });

  const verificationId = new URL(request.url).searchParams.get("verificationId");
  if (verificationId && !UUID.test(verificationId)) return Response.json({ error: "Provide a valid verification report ID." }, { status: 400 });

  const db = createServerDatabase();
  const select = "id,user_id,workspace_domain,report_type,schedule_at,recurrence_interval,payload_json";
  const due = verificationId
    ? await db.from("scheduled_reports").select(select).eq("id", verificationId).eq("status", "scheduled").lte("schedule_at", new Date().toISOString()).limit(1)
    : await db.from("scheduled_reports").select(select).eq("status", "scheduled").lte("schedule_at", new Date().toISOString()).order("schedule_at", { ascending: true }).limit(100);
  if (due.error) return Response.json({ error: "Scheduled report queue unavailable." }, { status: 503 });

  let sent = 0;
  let failed = 0;
  for (const item of due.data ?? []) {
    const recipient = item.payload_json.recipient;
    if (typeof recipient !== "string" || !/^\S+@\S+\.\S+$/.test(recipient)) {
      failed++;
      await db.from("scheduled_reports").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", item.id);
      continue;
    }
    const audit = await db.from("audits").select("id,status,created_at").eq("user_id", item.user_id).eq("domain", item.workspace_domain).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const links = audit.data ? await db.from("broken_links").select("id,http_status,cited_url,suggested_redirect,match_confidence,match_evidence_reason").eq("audit_id", audit.data.id).limit(100) : { data: [], error: null };
    const observations = audit.data ? await db.from("ai_observation_evidence").select("id").eq("audit_id", audit.data.id).limit(500) : { data: [], error: null };
    const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
    const rescued = await db.from("rescued_ai_visits").select("id", { count: "exact", head: true }).eq("domain", item.workspace_domain).gte("created_at", since30d);
    const broken = (links.data ?? []).filter(link => link.http_status === 404 || link.http_status === 410);
    const highIntent = broken.filter(link => !!link.suggested_redirect && (link.match_confidence ?? 0) >= 85 && /semantic.*commercial|commercial.*semantic/i.test(link.match_evidence_reason ?? "")).length;
    const safetyRejections = await db.from("action_audit_logs").select("id", { count: "exact", head: true }).eq("workspace_domain", item.workspace_domain).eq("action_type", "redirect_conflict_rejection").gte("created_at", since30d);
    const recoveredVisits = rescued.error ? "unavailable" : String(rescued.count ?? 0);
    const prevented = safetyRejections.error ? "unavailable" : String(safetyRejections.count ?? 0);
    const subject = `CiteMend ${item.report_type.replaceAll("_", " ")} · ${item.workspace_domain}`;
    const text = `Monthly Recovery & QA Value Summary · ${item.workspace_domain}\nNew verified high-intent dead URLs caught: ${highIntent} (requires recorded semantic and commercial match evidence)\nEstimated visits / orders / leads recovered: ${recoveredVisits} verified recovered visits in the last 30 days; order and lead attribution is not connected\nSoft-404s, loops & bad redirects prevented: ${prevented} logged redirect safety rejections in the last 30 days\nEngineering / SEO hours saved: ~${(highIntent * 0.5).toFixed(1)} estimated hours (30-minute planning assumption, not time-tracked)\n\nLatest audit: ${audit.data?.status ?? "No saved audit"}\nConfirmed broken citations in latest audit: ${broken.filter(link => link.http_status === 404).length}\nRecorded AI observations: ${observations.data?.length ?? 0}\n\nView the dashboard for full evidence and recovery controls.`;
    try {
      const recurrence = item.recurrence_interval ?? "one_time";
      const nextScheduleAt = nextScheduledReportAt(item.schedule_at, recurrence);
      const result = await sendEmail({ from: process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim(), to: recipient, subject, text, idempotencyKey: `scheduled-${item.id}-${Date.parse(item.schedule_at)}` });
      const updated = await db.from("scheduled_reports").update({ status: nextScheduleAt ? "scheduled" : "completed", schedule_at: nextScheduleAt ?? item.schedule_at, updated_at: new Date().toISOString(), payload_json: { ...item.payload_json, email_id: result.id, last_sent_at: new Date().toISOString() } }).eq("id", item.id);
      if (updated.error) throw new Error("Report state update failed.");
      sent++;
    } catch {
      failed++;
      await db.from("scheduled_reports").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", item.id);
    }
  }
  return Response.json({ sent, failed, processed: (due.data ?? []).length });
}

export const GET = send;
export const POST = send;
