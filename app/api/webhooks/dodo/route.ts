import DodoPayments from "dodopayments";
import { createHash } from "node:crypto";
import { createServerDatabase } from "@/lib/supabase-server";
import { dodoEventHash, dodoPilotPaymentRecord, dodoSubscriptionRecord, type DodoWebhook } from "@/lib/dodo-webhook";
import { founderNotificationEmail, sendEmail } from "@/lib/email-provider";
import { isBillingEnabled } from "@/lib/billing-checkout";

const MAX_BODY = 64 * 1024;
const headers = { "Cache-Control": "no-store" };
const subscriptionEvents = new Set([
  "subscription.active", "subscription.updated", "subscription.cancelled", "subscription.expired",
  "subscription.unpaused", "subscription.paused", "subscription.plan_changed", "subscription.renewed",
  "subscription.on_hold", "subscription.past_due", "subscription.failed",
]);

export async function POST(request: Request) {
  if (!isBillingEnabled()) return Response.json({ error: "Dodo Payments is not enabled." }, { status: 503, headers });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY) return Response.json({ error: "Webhook payload is too large." }, { status: 413, headers });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "Webhook payload is too large." }, { status: 413, headers });
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();
  const webhookId = request.headers.get("webhook-id");
  const signature = request.headers.get("webhook-signature");
  const timestamp = request.headers.get("webhook-timestamp");
  if (!webhookKey || !webhookId || !signature || !timestamp) return Response.json({ error: "Webhook signature is missing." }, { status: 401, headers });
  let event: DodoWebhook;
  try {
    const client = new DodoPayments({ webhookKey, environment: process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? "test_mode" : "live_mode" });
    event = client.webhooks.unwrap(raw, { key: webhookKey, headers: { "webhook-id": webhookId, "webhook-signature": signature, "webhook-timestamp": timestamp } }) as unknown as DodoWebhook;
  } catch { return Response.json({ error: "Invalid webhook signature." }, { status: 401, headers }); }

  if (typeof event.type !== "string" || !event.data || typeof event.data !== "object") return Response.json({ error: "Invalid webhook event." }, { status: 400, headers });
  const isSubscription = subscriptionEvents.has(event.type);
  const isPilotPayment = event.type === "payment.succeeded";
  if (!isSubscription && !isPilotPayment) return Response.json({ received: true, ignored: true }, { headers });

  let record: Record<string, unknown> | null;
  try {
    record = isSubscription ? dodoSubscriptionRecord(event) : dodoPilotPaymentRecord(event);
    if (isPilotPayment && !record) return Response.json({ received: true, ignored: true }, { headers });
  } catch { return Response.json({ error: "Webhook data does not match configured billing." }, { status: 400, headers }); }

  const eventHash = dodoEventHash(webhookId);
  try {
    const db = createServerDatabase();
    const { data, error } = await db.rpc("apply_dodo_billing_event", {
      p_hash: eventHash, p_event_name: event.type, p_payload: event as Record<string, unknown>, p_record: record,
    });
    if (error) return Response.json({ error: "Billing state could not be saved; retry delivery." }, { status: 503, headers });
    if (data === "duplicate") return Response.json({ duplicate: true }, { headers });
    if (data === "processed" && record && ["subscription.on_hold", "subscription.failed", "subscription.past_due"].includes(event.type) && typeof record.email === "string") {
      const recipients = [...new Set([founderNotificationEmail(), record.email].filter((value): value is string => !!value))];
      const results = await Promise.allSettled(recipients.map(async to => {
        const delivery = await sendEmail({
        to, subject: "CiteMend subscription needs attention",
        text: `A Dodo Payments subscription needs attention (${String(record?.id)}). Review the account in CiteMend billing.`,
        idempotencyKey: `dodo-billing-attention-${eventHash}-${createHash("sha256").update(to).digest("hex").slice(0, 12)}`,
        });
        if (delivery.status === "blocked_by_outbound_lock") throw new Error(delivery.status);
        return delivery;
      }));
      if (results.some(result => result.status === "rejected")) console.error("A Dodo billing alert could not be delivered.");
    }
    return Response.json({ received: true, ...(data === "ignored" ? { ignored: true } : {}) }, { headers });
  } catch { return Response.json({ error: "Billing storage is unavailable; retry delivery." }, { status: 503, headers }); }
}
