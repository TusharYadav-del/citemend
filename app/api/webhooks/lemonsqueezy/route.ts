import { isValidLemonSqueezySignature } from "@/lib/lemonsqueezy-webhook";
import { createServerDatabase } from "@/lib/supabase-server";
import { agencyVariantId } from "@/lib/lemonsqueezy";

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
  if (eventName !== "subscription_created" && eventName !== "subscription_cancelled" && eventName !== "subscription_updated") {
    return Response.json({ received: true, ignored: true });
  }

  const subscription = event.data;
  const attributes = subscription?.attributes;
  const subscriptionId = subscription?.id;
  const storeId = (process.env.LEMON_SQUEEZY_STORE_ID || process.env.LEMONSQUEEZY_STORE_ID)?.trim();
  const productId = (process.env.LEMON_SQUEEZY_PRODUCT_ID || process.env.LEMONSQUEEZY_PRODUCT_ID)?.trim();
  const variantId = String(attributes?.variant_id ?? "");
  const agency = variantId === agencyVariantId();
  if (!storeId || (!agency && !productId)) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  if (
    subscription?.type !== "subscriptions" ||
    typeof subscriptionId !== "string" ||
    !/^\d+$/.test(subscriptionId) ||
    !attributes ||
    String(attributes.store_id) !== storeId ||
    !/^\d+$/.test(String(attributes.product_id ?? "")) ||
    !/^\d+$/.test(variantId) ||
    (!agency && String(attributes.product_id) !== productId)
  ) {
    return Response.json({ error: "Invalid subscription event." }, { status: 400 });
  }
  if (process.env.NODE_ENV === "production" && attributes.test_mode === true) {
    return Response.json({ received: true, ignored: true });
  }

  const customUserId = event.meta?.custom_data?.user_id;
  const suppliedUserId = typeof customUserId === "string" && customUserId.trim() ? customUserId.trim() : null;
  const providerUpdatedAt = attributes.updated_at;
  if (typeof providerUpdatedAt !== "string" || !Number.isFinite(Date.parse(providerUpdatedAt)) || typeof attributes.status !== "string" || !attributes.status.trim()) {
    return Response.json({ error: "Invalid subscription event." }, { status: 400 });
  }

  let db: ReturnType<typeof createServerDatabase>;
  try { db = createServerDatabase(); } catch {
    return Response.json({ error: "Subscription storage is not configured." }, { status: 503 });
  }

  const numericString = (value: unknown) => value === null || value === undefined ? null : String(value);
  const cancelled = eventName === "subscription_cancelled" || attributes.cancelled === true || attributes.status === "cancelled";

  // Compare-and-swap avoids a delayed webhook overwriting newer billing state.
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: existing, error: readError } = await db.from("subscriptions")
        .select("user_id,provider_updated_at,cancelled")
        .eq("id", subscriptionId)
        .maybeSingle();
      if (readError) return Response.json({ error: "Subscription storage is unavailable." }, { status: 503 });
      if (existing && suppliedUserId && suppliedUserId !== existing.user_id) {
        return Response.json({ error: "Subscription owner does not match." }, { status: 400 });
      }
      const userId = existing?.user_id ?? suppliedUserId;
      if (!userId) return Response.json({ error: "Subscription owner is missing." }, { status: 400 });

      if (existing?.provider_updated_at) {
        const previousTime = Date.parse(existing.provider_updated_at);
        const incomingTime = Date.parse(providerUpdatedAt);
        if (previousTime > incomingTime || (previousTime === incomingTime && existing.cancelled && !cancelled)) {
          return Response.json({ received: true, ignored: true });
        }
      }

      const row = {
        id: subscriptionId,
        user_id: userId,
        store_id: storeId,
        product_id: String(attributes.product_id),
        variant_id: variantId,
        plan: agency ? "agency" : "pro",
        customer_id: numericString(attributes.customer_id),
        order_id: numericString(attributes.order_id),
        status: attributes.status,
        renews_at: typeof attributes.renews_at === "string" ? attributes.renews_at : null,
        ends_at: typeof attributes.ends_at === "string" ? attributes.ends_at : null,
        cancelled,
        provider_updated_at: providerUpdatedAt,
        updated_at: new Date().toISOString(),
      };

      if (!existing) {
        const { error } = await db.from("subscriptions").insert(row);
        if (!error) return Response.json({ received: true });
        if (error.code === "23505") continue;
        return Response.json({ error: "Subscription storage is unavailable." }, { status: 503 });
      }

      let update = db.from("subscriptions").update(row).eq("id", subscriptionId).eq("user_id", userId);
      update = existing.provider_updated_at
        ? update.eq("provider_updated_at", existing.provider_updated_at).lte("provider_updated_at", providerUpdatedAt)
        : update.is("provider_updated_at", null);
      const { data: updated, error } = await update.select("id").maybeSingle();
      if (error) return Response.json({ error: "Subscription storage is unavailable." }, { status: 503 });
      if (updated) return Response.json({ received: true });
    }
  } catch {
    return Response.json({ error: "Subscription storage is unavailable." }, { status: 503 });
  }
  return Response.json({ error: "Subscription update needs retry." }, { status: 503 });
}
