import { isBillingEnabled } from "@/lib/lemonsqueezy";
import { POST as createCheckout } from "@/app/api/billing/checkout/route";

export function GET() {
  return Response.json({ mode: isBillingEnabled() ? "billing" : "beta" }, { headers: { "Cache-Control": "no-store" } });
}

// Preserve the older URL while sharing the hardened Clerk, tier, and test-mode checks.
export async function POST(request: Request) {
  const plan = new URL(request.url).searchParams.get("plan") ?? "pro";
  if (plan !== "pro" && plan !== "agency") return Response.json({ error: "Choose a valid plan." }, { status: 400 });
  return createCheckout(new Request(request.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier: plan === "pro" ? "starter" : "agency" }),
  }));
}
