import "server-only";
import { Resend, type CreateEmailOptions } from "resend";

export type OutgoingEmail = {
  from?: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
};

export type EmailDelivery = { provider: "brevo" | "resend"; id: string };
type ResendSender = (apiKey: string, message: OutgoingEmail, from: string, replyTo?: string) => Promise<string>;
type EmailTransportOverrides = { fetcher?: typeof fetch; sendResend?: ResendSender };

type Mailbox = { name: string; email: string };
const PERSONAL_EMAIL_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com"]);

export function parseEmailMailbox(value: string): Mailbox {
  const trimmed = value.trim();
  const angle = /^(.*?)\s*<\s*([^<>]+)\s*>$/.exec(trimmed);
  const email = (angle?.[2] ?? trimmed).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error("Configure a valid email sender address.");
  const quotedName = angle?.[1]?.trim() ?? "";
  const name = (quotedName.startsWith('"') && quotedName.endsWith('"') ? quotedName.slice(1, -1) : quotedName).trim();
  return { name: name || "CiteMend", email };
}

export function isPersonalEmailSender(value: string): boolean {
  try { return PERSONAL_EMAIL_DOMAINS.has(parseEmailMailbox(value).email.split("@").at(-1)!.toLowerCase()); }
  catch { return false; }
}

function configuredSender(explicitFrom?: string): string {
  const from = explicitFrom?.trim() || process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) throw new Error("Configure EMAIL_FROM or RESEND_FROM_EMAIL before sending.");
  return from;
}

function recipientList(value: string | string[]) {
  const recipients = Array.isArray(value) ? value : [value];
  if (!recipients.length || recipients.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim()))) throw new Error("Configure valid email recipients.");
  return recipients.map(email => ({ email: email.trim() }));
}

async function sendWithResend(apiKey: string, message: OutgoingEmail, from: string, replyTo?: string): Promise<string> {
  if (!message.text && !message.html) throw new Error("Email content is required.");
  const payload: CreateEmailOptions = {
    from,
    to: message.to,
    subject: message.subject,
    ...(message.text !== undefined
      ? { text: message.text, ...(message.html !== undefined ? { html: message.html } : {}) }
      : { html: message.html! }),
    ...(replyTo ? { replyTo } : {}),
    ...(message.headers ? { headers: message.headers } : {}),
  };
  const result = await new Resend(apiKey).emails.send(payload, message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined);
  if (result.error || !result.data?.id) throw new Error("Resend rejected email delivery.");
  return result.data.id;
}

export async function sendEmail(message: OutgoingEmail, overrides: EmailTransportOverrides = {}): Promise<EmailDelivery> {
  const configuredFrom = configuredSender(message.from);
  const mailbox = parseEmailMailbox(configuredFrom);
  const replyTo = message.replyTo?.trim() || (isPersonalEmailSender(configuredFrom) ? mailbox.email : undefined);
  const brevoKey = process.env.BREVO_API_KEY?.trim();

  if (brevoKey) {
    const sender = { name: mailbox.name, email: mailbox.email };
    const payload = {
      sender,
      to: recipientList(message.to),
      subject: message.subject,
      ...(message.text ? { textContent: message.text } : {}),
      ...(message.html ? { htmlContent: message.html } : {}),
      ...(replyTo ? { replyTo: parseEmailMailbox(replyTo) } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    };
    const response = await (overrides.fetcher ?? fetch)("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "api-key": brevoKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Brevo rejected email delivery (HTTP ${response.status}).`);
    }
    const data: unknown = await response.json();
    const id = data && typeof data === "object" && typeof (data as { messageId?: unknown }).messageId === "string"
      ? (data as { messageId: string }).messageId
      : message.idempotencyKey;
    if (!id) throw new Error("Brevo returned no message ID.");
    return { provider: "brevo", id };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) throw new Error("Configure BREVO_API_KEY or RESEND_API_KEY before sending.");
  const sanitizedFrom = isPersonalEmailSender(configuredFrom) ? "CiteMend <onboarding@resend.dev>" : configuredFrom;
  const send = overrides.sendResend ?? sendWithResend;
  const id = await send(resendKey, message, sanitizedFrom, replyTo);
  return { provider: "resend", id };
}
