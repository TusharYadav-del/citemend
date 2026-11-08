import { createServerDatabase } from "@/lib/supabase-server";
import { verifyResendSignature } from "@/lib/outreach/resend-signature";
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim(); if (!secret) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  const raw = await request.text(); if (raw.length > 65536) return Response.json({ error: "Payload too large." }, { status: 413 });
  if (!verifyResendSignature(raw, { id: request.headers.get("svix-id") ?? "", timestamp: request.headers.get("svix-timestamp") ?? "", signature: request.headers.get("svix-signature") ?? "" }, secret)) return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!parsed || typeof parsed !== "object") return Response.json({ error: "Invalid event." }, { status: 400 });
  const event = parsed as { type?: unknown; data?: { email_id?: unknown; id?: unknown } };
  const eventId = request.headers.get("svix-id"); const type = String(event.type ?? "");
  const map: Record<string,string> = { "email.sent": "sent", "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained" };
  const status = map[type]; if (!status) return Response.json({ received: true, ignored: true });
  const messageId = event.data?.email_id ?? event.data?.id;
  if (typeof messageId !== "string") return Response.json({ error: "Email ID is missing." }, { status: 400 });
  try {
    const db = createServerDatabase();
    const { data: email, error } = await db.from("outreach_emails").select("id,prospect_id,recipient").eq("provider_message_id", messageId).maybeSingle();
    if (error) throw error; if (!email) return Response.json({ received: true, ignored: true });
    const { error: eventError } = await db.from("outreach_events").upsert({ email_id: email.id, prospect_id: email.prospect_id, event_type: status, provider_event_id: eventId, payload: event }, { onConflict: "provider_event_id" });
    if (eventError && eventError.code !== "23505") throw eventError;
    await db.from("outreach_emails").update({ status }).eq("id", email.id);
    if (status === "bounced" || status === "complained") await db.from("outreach_suppressions").upsert({ email: email.recipient, reason: status, source: "resend_webhook" }, { onConflict: "email" });
    return Response.json({ received: true });
  } catch { return Response.json({ error: "Webhook processing failed." }, { status: 503 }); }
}
