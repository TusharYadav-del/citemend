import "server-only";
import { createServerDatabase } from "./supabase-server";

export type SubscriptionState = { status: string; cancelled: boolean; ends_at: string | null };

export function grantsProAccess(subscription: SubscriptionState, now = Date.now()): boolean {
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
  const { data, error } = await db.from("subscriptions")
    .select("status,cancelled,ends_at")
    .eq("user_id", userId);
  if (error) throw new Error("Subscription status is temporarily unavailable.");
  return (data ?? []).some((subscription) => grantsProAccess(subscription));
}
