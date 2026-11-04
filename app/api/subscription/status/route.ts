import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { grantsProAccess, hasProSubscription, isMissingBetaColumns } from "@/lib/subscription";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to view subscription status." }, { status: 401 });
  try {
    const hasPro = await hasProSubscription(userId);
    const { data, error } = await createServerDatabase().from("subscriptions")
      .select("status,plan,current_period_end,cancelled,ends_at").eq("user_id", userId);
    if (isMissingBetaColumns(error)) return Response.json({ state: hasPro ? "paid" : "free", currentPeriodEnd: null });
    if (error) throw error;
    const rows = data ?? [];
    const paid = rows.find(row => row.plan === "agency" && grantsProAccess(row)) ?? rows.find(row => row.plan !== "pro_beta" && grantsProAccess(row));
    if (paid) {
      return Response.json({ state: "paid", plan: paid.plan === "agency" ? "agency" : "pro", currentPeriodEnd: null });
    }
    const beta = rows.find((row) => row.plan === "pro_beta");
    const state = beta?.status === "active" && grantsProAccess(beta) ? "active_beta"
      : beta?.status === "expired" || beta?.status === "active" ? "expired_beta"
        : beta?.status === "pending_beta" ? "pending_beta" : "free";
    return Response.json({ state, currentPeriodEnd: beta?.current_period_end ?? null });
  } catch {
    return Response.json({ error: "Subscription status is temporarily unavailable." }, { status: 503 });
  }
}
