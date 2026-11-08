import { auth, clerkClient } from "@clerk/nextjs/server";
import { requestDesignPartnerBeta } from "@/lib/beta-request";
import { notifyFounderOfBetaRequest } from "@/lib/founder-notification";
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
    if (result.requestCreated) {
      try {
        const notification = await notifyFounderOfBetaRequest({ userId, email, domain: result.domain ?? domain });
        if (notification === "not_configured") console.warn("Founder beta-request email is not configured.");
      } catch {
        console.error("Founder beta-request email could not be sent.");
      }
    }
    return Response.json({ unlocked: result.unlocked, message: result.message, currentPeriodEnd: result.currentPeriodEnd });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Enter a")) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Beta activation is temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
