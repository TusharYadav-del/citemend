import "server-only";
import { createServerDatabase } from "./supabase-server";

export type SubscriptionState = { status: string; cancelled: boolean; ends_at: string | null; plan?: string | null; current_period_end?: string | null; test_mode?: boolean | null };

export function isMissingOptionalSubscriptionColumns(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

export function grantsProAccess(subscription: SubscriptionState, now = Date.now()): boolean {
  if (process.env.NODE_ENV === "production" && process.env.DODO_PAYMENTS_ENVIRONMENT !== "test_mode" && subscription.test_mode === true) return false;
  if (subscription.plan === "pro_beta") return false;
  if (subscription.ends_at && Number.isFinite(Date.parse(subscription.ends_at)) && Date.parse(subscription.ends_at) <= now) return false;
  if (subscription.cancelled || subscription.status === "cancelled") {
    if (!["active", "on_trial", "past_due", "cancelled"].includes(subscription.status)) return false;
    const end = subscription.ends_at ? Date.parse(subscription.ends_at) : NaN;
    return Number.isFinite(end) && end > now;
  }
  return ["active", "on_trial", "past_due"].includes(subscription.status);
}

export async function hasProSubscription(userId: string): Promise<boolean> {
  if (!userId.trim()) throw new Error("An authenticated user ID is required.");
  const db = createServerDatabase();
  const current = await db.from("subscriptions").select("status,cancelled,ends_at,plan,current_period_end,test_mode").eq("user_id", userId);
  if (isMissingOptionalSubscriptionColumns(current.error)) {
    const legacy = await db.from("subscriptions").select("status,cancelled,ends_at").eq("user_id", userId);
    if (legacy.error) throw new Error("Subscription status is temporarily unavailable.");
    return (legacy.data ?? []).some((subscription) => grantsProAccess(subscription));
  }
  if (current.error) throw new Error("Subscription status is temporarily unavailable.");
  return (current.data ?? []).some((subscription) => grantsProAccess(subscription));
}
