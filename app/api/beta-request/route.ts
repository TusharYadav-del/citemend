import { auth, clerkClient } from "@clerk/nextjs/server";
import { requestDesignPartnerBeta } from "@/lib/beta-request";
import { founderEmailRecipient, sendFounderAlertEmail, type FounderEmailDelivery } from "@/lib/founder-alerts";
import { isBillingEnabled } from "@/lib/lemonsqueezy";

export async function POST(request: Request) {
  if (isBillingEnabled()) {
    return Response.json({ error: "Beta requests are closed while live billing is active." }, { status: 409 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "Expected JSON." }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return Response.json({ error: "Request is too large." }, { status: 413 });

  let userId: string | null;
  try { userId = (await auth()).userId; }
  catch { return Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 }); }
  if (!userId) return Response.json({ error: "Sign in to request the beta." }, { status: 401 });

  let domain: string;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return Response.json({ error: "Request is too large." }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    const value = body && typeof body === "object" ? (body as Record<string, unknown>).domain : undefined;
    if (typeof value !== "string" || value.length > 300) throw new Error();
    domain = value;
  } catch { return Response.json({ error: "Enter a valid public domain." }, { status: 400 }); }

  try {
    const user = await (await clerkClient()).users.getUser(userId);
    const email = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)?.emailAddress;
    if (!email) return Response.json({ error: "Add a primary email to your account before requesting the beta." }, { status: 422 });
    const result = await requestDesignPartnerBeta(userId, email, domain);
    let emailDelivery: FounderEmailDelivery;
    let founderEmailDelivery: FounderEmailDelivery | undefined;
    const acceptedDomain = result.domain ?? domain;
    if (result.betaAccepted) {
      emailDelivery = await sendFounderAlertEmail({
        to: email,
        subject: "Your CiteMend Pro Beta is accepted",
        text: `Your free CiteMend Pro Beta request for ${acceptedDomain} was accepted. Pro access is active for 30 days, through ${result.currentPeriodEnd ?? "the date shown in your account"}. No payment was taken.`,
        idempotencyKey: `beta-acceptance-${userId}`,
      });
      founderEmailDelivery = await sendFounderAlertEmail({
        to: founderEmailRecipient(),
        subject: `[CiteMend] Beta user accepted for ${acceptedDomain}`,
        text: `A beta request was accepted and Pro access was activated.\n\nDomain: ${acceptedDomain}\nAccount email: ${email}\nClerk user ID: ${userId}\nAccess ends: ${result.currentPeriodEnd ?? "unknown"}`,
        idempotencyKey: `founder-beta-accepted-${userId}`,
      });
    } else if (result.requestCreated) {
      emailDelivery = await sendFounderAlertEmail({
        subject: `[CiteMend] New free beta request for ${acceptedDomain}`,
        text: `A new free beta request is waiting for founder review.\n\nDomain: ${acceptedDomain}\nRequester email: ${email}\nClerk user ID: ${userId}\n\nThe request is saved in the subscriptions table with status pending_beta.`,
        idempotencyKey: `founder-beta-request-${userId}`,
      });
    } else {
      emailDelivery = { sent: false, provider: "none", error: "No new email was sent because this beta request was already processed." };
    }
    return Response.json({ unlocked: result.unlocked, message: result.message, currentPeriodEnd: result.currentPeriodEnd, emailDelivery, ...(founderEmailDelivery ? { founderEmailDelivery } : {}) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Enter a")) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Beta activation is temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
