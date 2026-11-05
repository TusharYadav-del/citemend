import type { createServerDatabase } from "./supabase-server";
type Database = ReturnType<typeof createServerDatabase>;

export async function claimWebhookEvent(db: Database, eventId: string, eventType: string): Promise<{ claimed: true } | { claimed: false }> {
  const inserted = await db.from("webhook_events_log").insert({ event_id: eventId, provider: "lemonsqueezy", event_type: eventType, delivery_status: "processing" }).select("event_id").maybeSingle();
  if (!inserted.error) return { claimed: true };
  if (inserted.error.code !== "23505") throw new Error("Webhook delivery log is unavailable.");
  const existing = await db.from("webhook_events_log").select("delivery_status,retry_count,received_at").eq("event_id", eventId).maybeSingle();
  if (existing.error || !existing.data) throw new Error("Webhook delivery log is unavailable.");
  const staleProcessing = existing.data.delivery_status === "processing" && Date.now() - Date.parse(existing.data.received_at) > 5 * 60_000;
  if (!staleProcessing && existing.data.delivery_status !== "failed") return { claimed: false };
  if (existing.data.retry_count >= 20) return { claimed: false };
  const retry = await db.from("webhook_events_log").update({ delivery_status: "processing", received_at: new Date().toISOString(), retry_count: existing.data.retry_count + 1, last_error: null }).eq("event_id", eventId).eq("delivery_status", existing.data.delivery_status).eq("retry_count", existing.data.retry_count).select("event_id").maybeSingle();
  if (retry.error) throw new Error("Webhook retry could not be claimed.");
  return { claimed: !!retry.data };
}

export async function finishWebhookEvent(db: Database, eventId: string, status: "completed" | "failed" | "ignored", error?: string) {
  const result = await db.from("webhook_events_log").update({ delivery_status: status, last_error: status === "failed" ? (error ?? "Delivery failed.").slice(0, 1000) : null, completed_at: new Date().toISOString() }).eq("event_id", eventId);
  if (result.error) throw new Error("Webhook delivery result could not be saved.");
}
