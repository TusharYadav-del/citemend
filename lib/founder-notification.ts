import "server-only";
import { sendEmail } from "./email-provider";

export async function notifyFounderOfBetaRequest(input: { userId: string; email: string; domain: string }): Promise<"sent" | "not_configured"> {
  const recipient = process.env.FOUNDER_NOTIFICATION_EMAIL?.trim();
  const hasProvider = Boolean(process.env.BREVO_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim());
  const hasSender = Boolean(process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim());
  if (!recipient || !hasProvider || !hasSender) return "not_configured";

  await sendEmail({
    from: process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim(),
    to: recipient,
    subject: `[CiteMend] New free beta request for ${input.domain}`,
    text: [
      "A new free beta request is waiting for founder review.",
      "",
      `Domain: ${input.domain}`,
      `Requester email: ${input.email}`,
      `Clerk user ID: ${input.userId}`,
      "",
      "The request is saved in the subscriptions table with status pending_beta.",
    ].join("\n"),
    idempotencyKey: `founder-beta-request-${input.userId}`,
  });
  return "sent";
}
