import "server-only";

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
export type EmailProviderAttempt = { status: number | null; data: unknown; messageId?: string; error: string | null };
export type EmailTransportOptions = {
  fetcher?: typeof fetch;
  sendResend?: (message: OutgoingEmail, from: string) => Promise<string>;
  preferResendFirst?: boolean;
};

export type Mailbox = { name: string; email: string };
export const RESEND_FOUNDER_FROM = "CiteMend <onboarding@resend.dev>";
export const DEFAULT_FOUNDER_EMAIL = "citemend.official@outlook.com";

const PERSONAL_EMAIL_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com"]);

export function founderNotificationEmail(): string {
  return process.env.FOUNDER_NOTIFICATION_EMAIL?.trim() || DEFAULT_FOUNDER_EMAIL;
}

export function parseEmailMailbox(value: string): Mailbox {
  const trimmed = value.trim();
  const angle = /^(.*?)\s*<\s*([^<>]+)\s*>$/.exec(trimmed);
  const email = (angle?.[2] ?? trimmed).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error("Configure a valid email address.");
  const quotedName = angle?.[1]?.trim() ?? "";
  const name = (quotedName.startsWith('"') && quotedName.endsWith('"') ? quotedName.slice(1, -1) : quotedName).trim();
  return { name: name || "CiteMend", email };
}

export function isPersonalEmailSender(value: string): boolean {
  try { return PERSONAL_EMAIL_DOMAINS.has(parseEmailMailbox(value).email.split("@").at(-1)!.toLowerCase()); }
  catch { return false; }
}

function recipientList(value: string | string[]) {
  const recipients = Array.isArray(value) ? value : [value];
  if (!recipients.length || recipients.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim()))) throw new Error("Configure valid email recipients.");
  return recipients.map(email => email.trim());
}

function parseBody(body: string): unknown {
  if (!body) return null;
  try { return JSON.parse(body) as unknown; }
  catch { return body; }
}

function bodyDescription(data: unknown): string {
  if (typeof data === "string") return data || "(empty response body)";
  try { return JSON.stringify(data) ?? "(empty response body)"; }
  catch { return "(unreadable response body)"; }
}

function messageId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const id = (data as { id?: unknown; messageId?: unknown }).id ?? (data as { messageId?: unknown }).messageId;
  return typeof id === "string" && id ? id : undefined;
}

async function readAttempt(response: Response, provider: "Resend" | "Brevo"): Promise<EmailProviderAttempt> {
  const raw = await response.text().catch(() => "");
  const data = parseBody(raw);
  if (!response.ok) return { status: response.status, data, error: `${provider} HTTP ${response.status}: ${raw || "(empty response body)"}` };
  const id = messageId(data);
  if (!id) return { status: response.status, data, error: `${provider} HTTP ${response.status}: response did not include a message ID; body: ${bodyDescription(data)}` };
  return { status: response.status, data, messageId: id, error: null };
}

export async function attemptResendEmail(
  message: OutgoingEmail,
  options: { apiKey?: string; fetcher?: typeof fetch; from?: string } = {},
): Promise<EmailProviderAttempt> {
  const apiKey = options.apiKey?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { status: null, data: null, error: "RESEND_API_KEY is not configured." };
  try {
    const recipients = recipientList(message.to);
    const response = await (options.fetcher ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: options.from ?? message.from ?? RESEND_FOUNDER_FROM,
        to: recipients,
        subject: message.subject,
        ...(message.text !== undefined ? { text: message.text } : {}),
        ...(message.html !== undefined ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      }),
    });
    return await readAttempt(response, "Resend");
  } catch (error) {
    return { status: null, data: null, error: `Resend request failed: ${error instanceof Error ? error.message : "Unknown network error."}` };
  }
}

export async function attemptBrevoEmail(
  message: OutgoingEmail,
  options: { apiKey?: string; fetcher?: typeof fetch; from?: string } = {},
): Promise<EmailProviderAttempt> {
  const apiKey = options.apiKey?.trim() || process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return { status: null, data: null, error: "BREVO_API_KEY is not configured." };
  try {
    const recipients = recipientList(message.to);
    const from = parseEmailMailbox(options.from ?? message.from ?? process.env.EMAIL_FROM?.trim() ?? process.env.RESEND_FROM_EMAIL?.trim() ?? "");
    const sameGmailAddress = from.email.toLowerCase().endsWith("@gmail.com") && recipients.some((email) => email.toLowerCase() === from.email.toLowerCase());
    if (sameGmailAddress) console.warn("Brevo sender and recipient are the same Gmail address; Gmail DMARC may reject this email.");
    const response = await (options.fetcher ?? fetch)("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: from,
        to: recipients.map((email) => ({ email })),
        subject: message.subject,
        ...(message.text !== undefined ? { textContent: message.text } : {}),
        ...(message.html !== undefined ? { htmlContent: message.html } : {}),
        ...(message.replyTo ? { replyTo: parseEmailMailbox(message.replyTo) } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      }),
    });
    return await readAttempt(response, "Brevo");
  } catch (error) {
    return { status: null, data: null, error: `Brevo request failed: ${error instanceof Error ? error.message : "Unknown network error."}` };
  }
}

async function attemptResendOverride(
  sender: NonNullable<EmailTransportOptions["sendResend"]>,
  message: OutgoingEmail,
  from: string,
): Promise<EmailProviderAttempt> {
  try {
    const id = await sender(message, from);
    return { status: 200, data: { id }, messageId: id, error: null };
  } catch (error) {
    return { status: null, data: null, error: `Resend request failed: ${error instanceof Error ? error.message : "Unknown error."}` };
  }
}

function isFounderRecipient(recipients: string[]): boolean {
  const founderEmails = new Set([founderNotificationEmail().toLowerCase(), DEFAULT_FOUNDER_EMAIL.toLowerCase()]);
  return recipients.some((recipient) => founderEmails.has(recipient.toLowerCase()));
}

export async function sendEmail(message: OutgoingEmail, options: EmailTransportOptions = {}): Promise<EmailDelivery> {
  const recipients = recipientList(message.to);
  const configuredFromEnv = message.from?.trim() || process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const brevoKey = process.env.BREVO_API_KEY?.trim();
  const founderDelivery = options.preferResendFirst || isFounderRecipient(recipients);
  if (!configuredFromEnv && !founderDelivery) throw new Error("Configure EMAIL_FROM or RESEND_FROM_EMAIL before sending.");
  const configuredFrom = configuredFromEnv || RESEND_FOUNDER_FROM;
  const resendFrom = founderDelivery ? RESEND_FOUNDER_FROM : isPersonalEmailSender(configuredFrom) ? RESEND_FOUNDER_FROM : configuredFrom;
  const replyTo = message.replyTo || (isPersonalEmailSender(configuredFrom) ? parseEmailMailbox(configuredFrom).email : undefined);
  const deliveryMessage = replyTo && !message.replyTo ? { ...message, replyTo } : message;

  if (founderDelivery) {
    const failures: string[] = [];
    if (resendKey) {
      const attempt = options.sendResend
        ? await attemptResendOverride(options.sendResend, deliveryMessage, resendFrom)
        : await attemptResendEmail(deliveryMessage, { apiKey: resendKey, fetcher: options.fetcher, from: resendFrom });
      if (attempt.messageId) return { provider: "resend", id: attempt.messageId };
      if (attempt.error) failures.push(attempt.error);
    } else failures.push("RESEND_API_KEY is not configured.");

    if (brevoKey) {
      const attempt = await attemptBrevoEmail(deliveryMessage, { apiKey: brevoKey, fetcher: options.fetcher, from: configuredFromEnv ?? "" });
      if (attempt.messageId) return { provider: "brevo", id: attempt.messageId };
      if (attempt.error) failures.push(attempt.error);
    } else failures.push("BREVO_API_KEY is not configured.");
    throw new Error(failures.join(" | "));
  }

  if (brevoKey) {
    const attempt = await attemptBrevoEmail(deliveryMessage, { apiKey: brevoKey, fetcher: options.fetcher, from: configuredFromEnv ?? "" });
    if (attempt.messageId) return { provider: "brevo", id: attempt.messageId };
    throw new Error(attempt.error ?? "Brevo delivery failed.");
  }
  if (!resendKey) throw new Error("Configure BREVO_API_KEY or RESEND_API_KEY before sending.");
  const attempt = options.sendResend
    ? await attemptResendOverride(options.sendResend, deliveryMessage, resendFrom)
    : await attemptResendEmail(deliveryMessage, { apiKey: resendKey, fetcher: options.fetcher, from: resendFrom });
  if (attempt.messageId) return { provider: "resend", id: attempt.messageId };
  throw new Error(attempt.error ?? "Resend delivery failed.");
}
