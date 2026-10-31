import { isValidLemonSqueezySignature } from "@/lib/lemonsqueezy-webhook";
import { createServerDatabase } from "@/lib/supabase-server";

const MAX_WEBHOOK_BYTES = 64 * 1024;

type SubscriptionEvent = {
  meta?: { event_name?: unknown; custom_data?: { user_id?: unknown } };
  data?: { type?: unknown; id?: unknown; attributes?: Record<string, unknown> };
};

async function readBoundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_WEBHOOK_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const secret = (process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || process.env.LEMONSQUEEZY_WEBHOOK_SECRET)?.trim();
  if (!secret) return Response.json({ error: "Webhook is not configured." }, { status: 503 });

  const rawBody = await readBoundedBody(request);
  const signature = request.headers.get("x-signature") ?? "";
  if (!rawBody || !isValidLemonSqueezySignature(rawBody, signature, secret)) {
    return Response.json({ error: "Invalid webhook signature or payload." }, { status: 401 });
  }

  let event: SubscriptionEvent;
  try {
    event = JSON.parse(rawBody) as SubscriptionEvent;
  } catch {
    return Response.json({ error: "Invalid webhook JSON." }, { status: 400 });
  }

  const eventName = event.meta?.event_name;
  if (eventName !== "subscription_created" && eventName !== "subscription_cancelled") {
    return Response.json({ received: true, ignored: true });
  }

  const subscription = event.data;
  const attributes = subscription?.attributes;
  const subscriptionId = subscription?.id;
  const storeId = (process.env.LEMON_SQUEEZY_STORE_ID || process.env.LEMONSQUEEZY_STORE_ID)?.trim();
  const productId = (process.env.LEMON_SQUEEZY_PRODUCT_ID || process.env.LEMONSQUEEZY_PRODUCT_ID)?.trim();
  if (!storeId || !productId) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  if (
    subscription?.type !== "subscriptions" ||
    typeof subscriptionId !== "string" ||
    !/^\d+$/.test(subscriptionId) ||
    !attributes ||
    String(attributes.store_id) !== storeId ||
    String(attributes.product_id) !== productId
  ) {
    return Response.json({ error: "Invalid subscription event." }, { status: 400 });
  }

  const customUserId = event.meta?.custom_data?.user_id;
  let userId = typeof customUserId === "string" && customUserId.trim() ? customUserId.trim() : null;
  let db: ReturnType<typeof createServerDatabase>;
  try { db = createServerDatabase(); } catch {
    return Response.json({ error: "Subscription storage is not configured." }, { status: 503 });
  }

  if (!userId) {
    const { data: existing, error } = await db.from("subscriptions").select("user_id").eq("id", subscriptionId).maybeSingle();
    if (error) return Response.json({ error: "Subscription storage is unavailable." }, { status: 503 });
    userId = existing?.user_id ?? null;
  }
  if (!userId) return Response.json({ error: "Subscription owner is missing." }, { status: 400 });

  const numericString = (value: unknown) => value === null || value === undefined ? null : String(value);
  const status = String(attributes.status ?? "active");
  const { error } = await db.from("subscriptions").upsert({
    id: subscriptionId,
    user_id: userId,
    store_id: String(attributes.store_id ?? ""),
    product_id: String(attributes.product_id ?? ""),
    variant_id: String(attributes.variant_id ?? ""),
    customer_id: numericString(attributes.customer_id),
    order_id: numericString(attributes.order_id),
    status,
    renews_at: typeof attributes.renews_at === "string" ? attributes.renews_at : null,
    ends_at: typeof attributes.ends_at === "string" ? attributes.ends_at : null,
    cancelled: eventName === "subscription_cancelled" || attributes.cancelled === true,
    provider_updated_at: typeof attributes.updated_at === "string" ? attributes.updated_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });

  if (error) return Response.json({ error: "Subscription storage is unavailable." }, { status: 503 });
  return Response.json({ received: true });
}


