import "server-only";
import { createHash } from "node:crypto";
import { configuredProductId, type BillingTier } from "./billing-checkout";

export type DodoWebhook = { type?: unknown; timestamp?: unknown; business_id?: unknown; data?: Record<string, unknown> };
const validDate = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const metadata = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export function dodoEventHash(webhookId: string): string {
  if (!webhookId || webhookId.length > 200) throw new TypeError("Dodo webhook ID is required.");
  return createHash("sha256").update(`dodo\0${webhookId}`).digest("hex");
}

function tierForProduct(productId: string): BillingTier | null {
  const matches: BillingTier[] = [];
  if (productId === configuredProductId("pilot")) matches.push("pilot");
  if (productId === configuredProductId("growth")) matches.push("growth");
  if (productId === configuredProductId("agency")) matches.push("agency");
  return matches.length === 1 ? matches[0] : null;
}
function validOwner(data: Record<string, unknown>, allowPlanChange = false): { userId: string; workspaceId: string; email: string | null; tier: BillingTier } {
  const meta = metadata(data.metadata);
  const legacyUserId = text(meta.user_id);
  const clerkUserId = text(meta.clerk_user_id);
  const userId = legacyUserId ?? clerkUserId;
  const workspaceId = text(meta.workspace_id) ?? userId;
  const email = text(meta.user_email) ?? text(metadata(data.customer).email);
  const productId = text(data.product_id);
  const tier = productId ? tierForProduct(productId) : null;
  if (!userId || clerkUserId && clerkUserId !== userId || !/^user_[A-Za-z0-9]+$/.test(userId) || !workspaceId || !/^(?:user|org)_[A-Za-z0-9]+$/.test(workspaceId) || !tier || (!allowPlanChange && meta.plan_tier !== undefined && meta.plan_tier !== tier)) throw new Error("Dodo billing metadata does not match an account, workspace, and configured product.");
  return { userId, workspaceId, email, tier };
}

export function dodoSubscriptionRecord(event: DodoWebhook) {
  const data = event.data;
  if (!data) throw new Error("Dodo subscription event is missing data.");
  const { userId, workspaceId, email, tier } = validOwner(data, event.type === "subscription.plan_changed");
  const id = text(data.subscription_id);
  const productId = text(data.product_id);
  const updatedAt = validDate(event.timestamp) ?? validDate(data.updated_at) ?? validDate(data.created_at);
  const statusValue = text(data.status);
  if (!id || !productId || !updatedAt || !statusValue) throw new Error("Dodo subscription event has invalid identity or state.");
  const status = statusValue === "failed" ? "unpaid" : statusValue;
  if (!["pending", "active", "on_hold", "paused", "cancelled", "expired", "past_due", "unpaid"].includes(status)) throw new Error("Unknown Dodo subscription status.");
  const cancelled = data.cancel_at_next_billing_date === true || status === "cancelled" || status === "expired";
  const endsAt = validDate(data.expires_at) ?? (data.cancel_at_next_billing_date === true ? validDate(data.next_billing_date) : null);
  return {
    id, user_id: userId, workspace_id: workspaceId, email, billing_provider: "dodo", store_id: text(event.business_id) ?? text(data.business_id) ?? "dodo",
    product_id: productId, variant_id: productId, customer_id: text(metadata(data.customer).customer_id), order_id: null,
    plan: tier === "pilot" ? "pro" : tier, plan_name: tier, status, test_mode: process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode",
    renews_at: tier === "pilot" ? null : validDate(data.next_billing_date), ends_at: tier === "pilot" ? null : endsAt,
    cancelled, provider_updated_at: updatedAt,
  };
}

export function dodoPilotPaymentRecord(event: DodoWebhook) {
  const data = event.data;
  if (!data || !Array.isArray(data.product_cart) || !data.product_cart.length) return null;
  const pilotProductId = configuredProductId("pilot");
  const cart = data.product_cart as Array<Record<string, unknown>>;
  if (!pilotProductId || cart.length !== 1 || cart[0].product_id !== pilotProductId || (Array.isArray(data.subscription_ids) && data.subscription_ids.length > 0)) return null;
  const { userId, workspaceId, email, tier } = validOwner({ ...data, product_id: pilotProductId });
  if (tier !== "pilot") throw new Error("The one-time checkout is not a configured pilot product.");
  const id = text(data.payment_id);
  const updatedAt = validDate(event.timestamp) ?? validDate(data.created_at);
  if (!id || !updatedAt) throw new Error("Dodo pilot payment has invalid identity.");
  const endsAt = new Date(Date.parse(updatedAt) + 30 * 86400_000).toISOString();
  return {
    id, user_id: userId, workspace_id: workspaceId, email, billing_provider: "dodo", store_id: text(data.business_id) ?? "dodo",
    product_id: pilotProductId, variant_id: pilotProductId, customer_id: text(metadata(data.customer).customer_id), order_id: id,
    plan: "pro", plan_name: "pilot", status: "active", test_mode: process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode",
    renews_at: null, ends_at: endsAt, cancelled: false, provider_updated_at: updatedAt,
  };
}
