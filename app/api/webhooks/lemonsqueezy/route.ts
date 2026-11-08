import { createServerDatabase } from "@/lib/supabase-server";
import { createHash } from "node:crypto";
import { isValidLemonSqueezySignature } from "@/lib/lemonsqueezy-webhook";
import { applyPaymentEventState, deliveryHash, isTestDelivery, subscriptionRecord, type BillingPayload } from "@/lib/billing-webhook";
import { founderNotificationEmail, sendEmail } from "@/lib/email-provider";

const MAX_BODY = 64 * 1024;
const headers = { "Cache-Control": "no-store" };
const subscriptionEvents = new Set([
  "subscription_created", "subscription_updated", "subscription_cancelled", "subscription_expired",
  "subscription_resumed", "subscription_paused", "subscription_unpaused", "subscription_plan_changed",
]);
const paymentEvents = new Set(["subscription_payment_success", "subscription_payment_recovered", "subscription_payment_failed"]);

async function fetchSubscription(id: string): Promise<BillingPayload> {
  const key = (process.env.LEMONSQUEEZY_API_KEY || process.env.LEMON_SQUEEZY_API_KEY)?.trim();
  if (!key) throw new Error("Lemon Squeezy API key is missing.");
  const response = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Could not read the subscription from Lemon Squeezy.");
  return await response.json() as BillingPayload;
}

export async function POST(request: Request) {
  // The signature covers the exact bytes Lemon Squeezy delivered.
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY) return Response.json({ error: "Webhook payload is too large." }, { status: 413, headers });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY) return Response.json({ error: "Webhook payload is too large." }, { status: 413, headers });
  const secret = (process.env.LEMONSQUEEZY_WEBHOOK_SECRET || process.env.LEMON_SQUEEZY_WEBHOOK_SECRET)?.trim();
  const signature = request.headers.get("x-signature") ?? "";
  if (!secret || !isValidLemonSqueezySignature(raw, signature, secret)) {
    return Response.json({ error: "Unauthorized webhook." }, { status: 401, headers });
  }
  let payload: BillingPayload;
  try { payload = JSON.parse(raw) as BillingPayload; }
  catch { return Response.json({ error: "Invalid webhook JSON." }, { status: 400, headers }); }
  if (!payload || typeof payload !== "object") return Response.json({ error: "Invalid webhook JSON." }, { status: 400, headers });
  const eventName = payload.meta?.event_name;
  const objectId = payload.data?.id;
  if (typeof eventName !== "string" || typeof objectId !== "string" || !/^\d+$/.test(objectId)) {
    return Response.json({ error: "Invalid webhook identity." }, { status: 400, headers });
  }
  if (process.env.NODE_ENV === "production" && process.env.LEMON_SQUEEZY_TEST_MODE !== "true" && isTestDelivery(payload)) {
    return Response.json({ error: "Test billing events are disabled in production." }, { status: 403, headers });
  }
  if (!subscriptionEvents.has(eventName) && !paymentEvents.has(eventName) && eventName !== "order_created") {
    return Response.json({ received: true, ignored: true }, { headers });
  }

  let snapshot = payload;
  let subscriptionId: string | undefined;
  if (paymentEvents.has(eventName)) {
    const value = payload.data?.attributes?.subscription_id;
    if (payload.data?.type !== "subscription-invoices" || !/^\d+$/.test(String(value ?? ""))) {
      return Response.json({ error: "Invalid subscription invoice." }, { status: 400, headers });
    }
    subscriptionId = String(value);
  }
  const eventHash = deliveryHash(raw, eventName, objectId, subscriptionId);
  let db: ReturnType<typeof createServerDatabase>;
  try {
    db = createServerDatabase();
    const prior = await db.from("billing_webhook_events").select("id").eq("event_hash", eventHash).maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) return Response.json({ duplicate: true }, { headers });
  } catch { return Response.json({ error: "Billing storage is unavailable; retry delivery." }, { status: 503, headers }); }
  if (paymentEvents.has(eventName)) {
    try {
      const fresh = await fetchSubscription(subscriptionId!);
      snapshot = { ...fresh, meta: { ...payload.meta, custom_data: payload.meta?.custom_data ?? fresh.meta?.custom_data } };
    } catch { return Response.json({ error: "Subscription could not be verified with the provider." }, { status: 503, headers }); }
    if (process.env.NODE_ENV === "production" && process.env.LEMON_SQUEEZY_TEST_MODE !== "true" && isTestDelivery(snapshot)) {
      return Response.json({ error: "Test billing events are disabled in production." }, { status: 403, headers });
    }
  }

  let record: ReturnType<typeof subscriptionRecord> | null = null;
  try {
    if (subscriptionEvents.has(eventName) || paymentEvents.has(eventName)) {
      record = subscriptionRecord(snapshot, eventName);
      if (subscriptionId && record.id !== subscriptionId) throw new Error("Invoice subscription mismatch.");
      if (paymentEvents.has(eventName)) record = applyPaymentEventState(record, eventName, payload.data?.attributes ?? {});
    } else {
      const storeId = (process.env.LEMONSQUEEZY_STORE_ID || process.env.LEMON_SQUEEZY_STORE_ID)?.trim();
      if (payload.data?.type !== "orders" || String(payload.data.attributes?.store_id) !== storeId || !storeId) throw new Error("Invalid order store.");
    }
  } catch { return Response.json({ error: "Webhook data does not match configured billing." }, { status: 400, headers }); }

  try {
    const { data, error } = await db.rpc("apply_billing_webhook_event", { p_hash: eventHash, p_event_name: eventName, p_payload: payload as Record<string, unknown>, p_record: record });
    if (error) return Response.json({ error: "Billing state could not be saved; retry delivery." }, { status: 503, headers });
    if (data === "duplicate") return Response.json({ duplicate: true }, { headers });
    if (eventName === "subscription_payment_failed" && data === "processed" && record?.status === "past_due") {
      const current = record;
      const stored = current.email ? null : await db.from("subscriptions").select("email").eq("id", current.id).maybeSingle();
      const userEmail = current.email ?? (stored && !stored.error ? stored.data?.email : null);
      const recipients = [...new Set([founderNotificationEmail(), userEmail].filter((value): value is string => !!value))];
      const results = await Promise.allSettled(recipients.map(to => sendEmail({
        to, subject: "CiteMend subscription payment failed",
        text: `A Lemon Squeezy payment failed for subscription ${current.id}. Update the payment method in the CiteMend billing page.`,
        idempotencyKey: `billing-failed-${eventHash}-${createHash("sha256").update(to).digest("hex").slice(0, 12)}`,
      })));
      if (results.some(result => result.status === "rejected")) console.error("A billing payment-failure alert could not be delivered.");
    }
    return Response.json({ received: true, ...(data === "ignored" ? { ignored: true } : {}) }, { headers });
  } catch {
    return Response.json({ error: "Billing storage is unavailable; retry delivery." }, { status: 503, headers });
  }
}
