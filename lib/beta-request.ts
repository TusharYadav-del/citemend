import "server-only";
import { normalizeDashboardDomain } from "./audit-dashboard";
import { createServerDatabase } from "./supabase-server";
import { expireBetaSubscriptions, grantsProAccess } from "./subscription";

type DatabaseClient = ReturnType<typeof createServerDatabase>;
export type BetaRequestResult = { unlocked: boolean; message: string; currentPeriodEnd: string | null; requestCreated?: boolean; domain?: string };
export const BETA_ACTIVE_MESSAGE = "🎉 VIP Beta Activated! Full Pro access is now unlocked for 30 days.";
export const BETA_PENDING_MESSAGE = "✅ Beta request received for your account! Your domain is queued for founder approval.";

export function betaInvitationAllowed(email: string): boolean {
  const invited = new Set((process.env.BETA_INVITED_EMAILS ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean));
  return invited.has(email.toLowerCase());
}

export async function requestDesignPartnerBeta(
  userId: string,
  email: string,
  rawDomain: string,
  now = new Date(),
  db: DatabaseClient = createServerDatabase(),
): Promise<BetaRequestResult> {
  if (!userId.trim()) throw new Error("A signed-in account is required.");
  if (!email.includes("@") || email.length > 320) throw new Error("A valid account email is required.");
  const domain = normalizeDashboardDomain(rawDomain);
  const address = email.trim().toLowerCase();
  const read = () => db.from("subscriptions")
    .select("id,user_id,email,domain,status,plan,current_period_end,cancelled,ends_at")
    .eq("user_id", userId);
  const current = await read();
  if (current.error) throw new Error("Beta subscriptions are temporarily unavailable. Apply migration 008.");
  const paid = (current.data ?? []).find((row) => row.plan !== "pro_beta" && grantsProAccess(row, now.getTime()));
  if (paid) return { unlocked: true, message: "Pro access is already active on your account.", currentPeriodEnd: null };

  const betaId = `beta:${userId}`;
  let beta = (current.data ?? []).find((row) => row.plan === "pro_beta");
  let requestCreated = false;
  if (beta && beta.id !== betaId) throw new Error("A beta record already exists for this account.");
  if (beta?.status === "active") {
    if (!grantsProAccess(beta, now.getTime())) {
      await expireBetaSubscriptions(userId, now);
      return { unlocked: false, message: "Your 30-day Pro Beta access has expired. Upgrade to Pro when paid plans become available.", currentPeriodEnd: beta.current_period_end };
    }
    return grantsProAccess(beta, now.getTime())
      ? { unlocked: true, message: BETA_ACTIVE_MESSAGE, currentPeriodEnd: beta.current_period_end }
      : { unlocked: false, message: "Your 30-day beta period has ended.", currentPeriodEnd: beta.current_period_end };
  }
  if (beta?.status === "expired") return { unlocked: false, message: "Your 30-day Pro Beta access has expired. Upgrade to Pro when paid plans become available.", currentPeriodEnd: beta.current_period_end };

  const matchingEmail = await db.from("subscriptions").select("user_id").eq("plan", "pro_beta").eq("email", address).maybeSingle();
  if (matchingEmail.error) throw new Error("Beta subscriptions are temporarily unavailable.");
  if (matchingEmail.data && matchingEmail.data.user_id !== userId) throw new Error("This email is already linked to another beta account.");

  if (!beta) {
    const inserted = await db.from("subscriptions").insert({
      id: betaId, user_id: userId, email: address, domain, plan: "pro_beta", status: "pending_beta",
      store_id: "internal-beta", product_id: "pro_beta", variant_id: "design-partner", current_period_end: null,
    }).select("id,user_id,email,domain,status,plan,current_period_end,cancelled,ends_at").maybeSingle();
    if (inserted.error?.code === "23505") {
      const raced = await read();
      if (raced.error) throw new Error("Beta subscriptions are temporarily unavailable.");
      beta = (raced.data ?? []).find((row) => row.id === betaId);
    } else if (inserted.error || !inserted.data) throw new Error("Beta subscriptions are temporarily unavailable.");
    else { beta = inserted.data; requestCreated = true; }
    if (!beta) throw new Error("Beta subscriptions are temporarily unavailable.");
  }

  if (!betaInvitationAllowed(address)) {
    if (beta.email !== address || beta.domain !== domain) {
      const { error } = await db.from("subscriptions").update({ email: address, domain, updated_at: now.toISOString() })
        .eq("id", betaId).eq("user_id", userId).eq("status", "pending_beta");
      if (error) throw new Error("Beta subscriptions are temporarily unavailable.");
    }
    return { unlocked: false, message: BETA_PENDING_MESSAGE, currentPeriodEnd: null, requestCreated, domain };
  }

  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const activated = await db.from("subscriptions").update({
    email: address, domain, status: "active", plan: "pro_beta", current_period_end: periodEnd,
    ends_at: periodEnd, cancelled: false, updated_at: now.toISOString(),
  }).eq("id", betaId).eq("user_id", userId).eq("status", "pending_beta")
    .select("id,status,plan,current_period_end,cancelled,ends_at").maybeSingle();
  if (activated.error) throw new Error("Beta activation is temporarily unavailable.");
  if (activated.data) return { unlocked: true, message: BETA_ACTIVE_MESSAGE, currentPeriodEnd: activated.data.current_period_end };

  const raced = await read();
  const grant = (raced.data ?? []).find((row) => row.id === betaId);
  if (raced.error || !grant || !grantsProAccess(grant, now.getTime())) throw new Error("Beta activation is temporarily unavailable.");
  return { unlocked: true, message: BETA_ACTIVE_MESSAGE, currentPeriodEnd: grant.current_period_end };
}
