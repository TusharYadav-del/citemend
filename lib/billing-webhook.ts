import "server-only";
import { createHash } from "node:crypto";
import type { BillingTier } from "./billing-checkout";

export type BillingPayload = {
  meta?: { event_name?: unknown; test_mode?: unknown; custom_data?: { user_id?: unknown; user_email?: unknown; plan_tier?: unknown } };
  data?: { type?: unknown; id?: unknown; attributes?: Record<string, unknown> };
};

const STATUS = new Set(["on_trial", "active", "paused", "past_due", "unpaid", "cancelled", "expired"]);
const digits = (value: unknown) => /^\d+$/.test(String(value ?? "")) && Number.isSafeInteger(Number(value));
const dateOrNull = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;

export function deliveryHash(raw: string, eventName: string, objectId: string, subscriptionId?: string): string {
  return createHash("sha256").update(raw).update("\0").update(eventName).update("\0").update(objectId).update("\0").update(subscriptionId ?? "").digest("hex");
}

export function isTestDelivery(payload: BillingPayload): boolean {
  return payload.meta?.test_mode === true || payload.data?.attributes?.test_mode === true;
}

export function configuredBillingTier(variantId: string): BillingTier | null {
  const variants: [BillingTier, string | undefined][] = [
    ["starter", process.env.LEMONSQUEEZY_STARTER_VARIANT_ID],
    ["growth", process.env.LEMONSQUEEZY_GROWTH_VARIANT_ID],
    ["agency", process.env.LEMONSQUEEZY_AGENCY_VARIANT_ID || process.env.LEMON_SQUEEZY_AGENCY_VARIANT_ID],
  ];
  const matches = variants.filter(([, id]) => id?.trim() === variantId);
  return matches.length === 1 ? matches[0][0] : null;
}

export function trustedBillingUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const customHost = process.env.LEMONSQUEEZY_PORTAL_HOST?.trim().toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !(url.hostname === "lemonsqueezy.com" || url.hostname.endsWith(".lemonsqueezy.com") || (customHost && url.hostname === customHost))) return null;
    return url.href;
  } catch { return null; }
}

export function signedUrlFresh(value: string | null, now = Date.now()): boolean {
  if (!value) return false;
  const trusted = trustedBillingUrl(value);
  if (!trusted) return false;
  const expires = new URL(trusted).searchParams.get("expires");
  return !!expires && /^\d+$/.test(expires) && Number(expires) * 1000 > now + 5 * 60_000;
}

export function subscriptionRecord(payload: BillingPayload, eventName: string) {
  const data = payload.data;
  const attr = data?.attributes;
  const storeId = (process.env.LEMONSQUEEZY_STORE_ID || process.env.LEMON_SQUEEZY_STORE_ID)?.trim();
  if (data?.type !== "subscriptions" || !digits(data.id) || !attr || !digits(storeId) || String(attr.store_id) !== storeId || !digits(attr.product_id) || !digits(attr.variant_id)) {
    throw new Error("Invalid subscription identity.");
  }
  const variantId = String(attr.variant_id);
  const tier = configuredBillingTier(variantId);
  if (!tier || (payload.meta?.custom_data?.plan_tier && payload.meta.custom_data.plan_tier !== tier)) throw new Error("Subscription variant does not match a configured tier.");
  if (typeof attr.test_mode !== "boolean") throw new Error("Subscription mode is missing.");
  const updatedAt = dateOrNull(attr.updated_at);
  if (!updatedAt || typeof attr.status !== "string" || !STATUS.has(attr.status)) throw new Error("Invalid subscription state.");
  const status = eventName === "subscription_expired" ? "expired" : eventName === "subscription_cancelled" ? "cancelled" : attr.status;
  const urls = attr.urls && typeof attr.urls === "object" ? attr.urls as Record<string, unknown> : {};
  const custom = payload.meta?.custom_data;
  const userId = typeof custom?.user_id === "string" && /^user_[A-Za-z0-9]+$/.test(custom.user_id) ? custom.user_id : null;
  const email = typeof custom?.user_email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(custom.user_email) ? custom.user_email : null;
  return {
    id: String(data.id), user_id: userId, email, store_id: storeId,
    product_id: String(attr.product_id), variant_id: variantId,
    customer_id: digits(attr.customer_id) ? String(attr.customer_id) : null,
    order_id: digits(attr.order_id) ? String(attr.order_id) : null,
    plan: tier === "starter" ? "pro" : tier, plan_name: tier,
    status, test_mode: attr.test_mode,
    renews_at: dateOrNull(attr.renews_at), ends_at: dateOrNull(attr.ends_at), trial_ends_at: dateOrNull(attr.trial_ends_at),
    customer_portal_url: trustedBillingUrl(urls.customer_portal), update_payment_method_url: trustedBillingUrl(urls.update_payment_method),
    cancelled: status === "cancelled" || status === "expired" || attr.cancelled === true,
    provider_updated_at: updatedAt,
  };
}

export function applyPaymentEventState(record: ReturnType<typeof subscriptionRecord>, eventName: string, invoice: Record<string, unknown>) {
  const eventTime = dateOrNull(invoice.updated_at) ?? dateOrNull(invoice.created_at);
  if (!eventTime) throw new Error("Subscription invoice timestamp is missing.");
  if (eventName !== "subscription_payment_failed" && invoice.status !== "paid") throw new Error("A payment success event needs a paid invoice.");
  if (record.status === "cancelled" || record.status === "expired" || record.cancelled) return record;
  if (Date.parse(record.provider_updated_at) > Date.parse(eventTime)) return record;
  if (eventName === "subscription_payment_failed") return { ...record, status: "past_due", provider_updated_at: eventTime };
  if (record.status === "past_due" || record.status === "unpaid") return { ...record, status: "active", provider_updated_at: eventTime };
  return record;
}
