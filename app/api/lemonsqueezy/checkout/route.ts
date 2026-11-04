import { auth } from "@clerk/nextjs/server";
import { configuredCheckoutUrl, createLemonSqueezyCheckout, isBillingEnabled } from "@/lib/lemonsqueezy";

export function GET() {
  return Response.json({ mode: isBillingEnabled() ? "billing" : "beta" });
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return Response.json({ error: "Sign-in is not configured." }, { status: 503 });
  }

  let userId: string | null;
  try {
    userId = (await auth()).userId;
  } catch {
    return Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 });
  }
  if (!userId) return Response.json({ error: "Sign in before upgrading." }, { status: 401 });
  const plan = new URL(request.url).searchParams.get("plan") ?? "pro";
  if (plan !== "pro" && plan !== "agency") return Response.json({ error: "Choose a valid plan." }, { status: 400 });
  if (!isBillingEnabled()) return Response.json({ betaMode: true });

  try {
    const testMode = process.env.NODE_ENV === "development" && process.env.LEMON_SQUEEZY_TEST_MODE === "true";
    const checkoutUrl = (plan === "pro" && !testMode ? configuredCheckoutUrl(userId) : null) ?? await createLemonSqueezyCheckout(userId, testMode, plan);
    return Response.json({ checkoutUrl, testMode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("not configured") ? 503 : 502;
    return Response.json({ error: status === 503 ? message : "Checkout is temporarily unavailable. Please try again." }, { status });
  }
}

