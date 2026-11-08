import "server-only";
import {
  DEFAULT_FOUNDER_EMAIL,
  attemptBrevoEmail,
  attemptResendEmail,
  founderNotificationEmail,
  sendEmail,
  type EmailProviderAttempt,
  type EmailTransportOptions,
  type OutgoingEmail,
} from "./email-provider";

export type FounderEmailDelivery = {
  sent: boolean;
  provider: "resend" | "brevo" | "none";
  messageId?: string;
  error?: string;
};

export type EmailProviderDiagnostic = Pick<EmailProviderAttempt, "status" | "data" | "error">;

export function founderEmailRecipient(): string {
  return founderNotificationEmail() || DEFAULT_FOUNDER_EMAIL;
}

export async function sendFounderAlertEmail(
  message: Omit<OutgoingEmail, "to"> & { to?: string },
  options: EmailTransportOptions = {},
): Promise<FounderEmailDelivery> {
  try {
    const delivery = await sendEmail({
      ...message,
      to: message.to?.trim() || founderEmailRecipient(),
      from: message.from?.trim() || process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim(),
    }, { ...options, preferResendFirst: true });
    return { sent: true, provider: delivery.provider, messageId: delivery.id };
  } catch (error) {
    return { sent: false, provider: "none", error: error instanceof Error ? error.message : "Unknown email delivery error." };
  }
}

export async function runFounderEmailDiagnostic(fetcher: typeof fetch = fetch) {
  const recipient = founderEmailRecipient();
  const message: OutgoingEmail = {
    from: process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim() || "CiteMend <onboarding@resend.dev>",
    to: recipient,
    subject: "CiteMend Beta Acceptance & Founder Alert Test",
    text: "This is a delivery diagnostic for CiteMend beta acceptance and founder alerts.",
    idempotencyKey: `email-diagnostic-${Date.now()}`,
  };

  const [resendResult, brevoResult] = await Promise.all([
    attemptResendEmail(message, { fetcher, from: "CiteMend <onboarding@resend.dev>" }),
    attemptBrevoEmail(message, { fetcher }),
  ]);
  return {
    envCheck: {
      RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY?.trim()),
      BREVO_API_KEY: Boolean(process.env.BREVO_API_KEY?.trim()),
      FOUNDER_NOTIFICATION_EMAIL: Boolean(process.env.FOUNDER_NOTIFICATION_EMAIL?.trim()),
      RESEND_FROM_EMAIL: Boolean(process.env.RESEND_FROM_EMAIL?.trim()),
    },
    resendResult: diagnosticResult(resendResult),
    brevoResult: diagnosticResult(brevoResult),
  };
}

function diagnosticResult(attempt: EmailProviderAttempt): EmailProviderDiagnostic {
  return { status: attempt.status, data: attempt.data, error: attempt.error };
}
