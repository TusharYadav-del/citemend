import { createHmac, timingSafeEqual } from "node:crypto";
import { createServerDatabase } from "@/lib/supabase-server";
function verify(raw: string, supplied: string, secret: string) {
  const signature = supplied.replace(/^sha256=/, "");
  try { const expected = createHmac("sha256", secret).update(raw).digest(); const actual = Buffer.from(signature, "hex"); return actual.length === expected.length && timingSafeEqual(actual, expected); } catch { return false; }
}
export async function POST(request: Request) {
  const secret = process.env.OUTREACH_REPLY_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ error: "Reply webhook is not configured." }, { status: 503 });
  const raw = await request.text(); if (!raw || raw.length > 32_768) return Response.json({ error: "Invalid or oversized reply event." }, { status: 413 });
  if (!verify(raw, request.headers.get("x-outreach-signature") ?? "", secret)) return Response.json({ error: "Invalid reply signature." }, { status: 401 });
  let body: unknown; try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid reply event." }, { status: 400 });
  const event = body as { event_id?: unknown; provider_message_id?: unknown; from?: unknown; excerpt?: unknown };
  if (typeof event.event_id !== "string" || !event.event_id || typeof event.provider_message_id !== "string" || !event.provider_message_id || typeof event.from !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(event.from)) return Response.json({ error: "Reply event is missing its IDs or sender." }, { status: 400 });
  try {
    const db = createServerDatabase();
    const { data: email, error } = await db.from("outreach_emails").select("id,prospect_id").eq("provider_message_id", event.provider_message_id).maybeSingle();
    if (error) throw error; if (!email) return Response.json({ received: true, ignored: true });
    const { error: eventError } = await db.from("outreach_events").insert({ email_id: email.id, prospect_id: email.prospect_id, event_type: "reply", provider_event_id: `reply:${event.event_id}`, payload: { from: event.from.toLowerCase(), excerpt: typeof event.excerpt === "string" ? event.excerpt.slice(0, 500) : null } });
    if (eventError?.code === "23505") return Response.json({ received: true, duplicate: true });
    if (eventError) throw eventError;
    if (email.prospect_id) await db.from("outreach_prospects").update({ status: "replied" }).eq("id", email.prospect_id);
    return Response.json({ received: true });
  } catch { return Response.json({ error: "Reply event could not be recorded." }, { status: 503 }); }
}
