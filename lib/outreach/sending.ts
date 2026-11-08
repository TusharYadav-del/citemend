import "server-only";
import { sendEmail } from "../email-provider";
import type { GeneratedOutreachEmail } from "./email-generation";

export async function sendOutreachEmail(input: { idempotencyKey: string; to: string; from: string; message: GeneratedOutreachEmail; fetcher?: typeof fetch }): Promise<{ provider: string; messageId: string }> {
  const webhook = process.env.BREVO_API_KEY?.trim() ? undefined : process.env.OUTBOUND_WEBHOOK_URL?.trim();
  if (webhook) {
    const url = new URL(webhook);
    if (!/^https:$/.test(url.protocol) || url.username || url.password) throw new Error("OUTBOUND_WEBHOOK_URL must be a credential-free HTTPS URL.");
    const response = await (input.fetcher ?? fetch)(url, { method: "POST", signal: AbortSignal.timeout(10_000), headers: { "Content-Type": "application/json", ...(process.env.OUTBOUND_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.OUTBOUND_WEBHOOK_SECRET}` } : {}) }, body: JSON.stringify({ idempotencyKey: input.idempotencyKey, to: input.to, from: input.from, subject: input.message.subject, text: input.message.text, html: input.message.html, headers: { "List-Unsubscribe": `<${extractUnsubscribe(input.message.text)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }) });
    if (!response.ok) throw new Error(`Outbound webhook returned HTTP ${response.status}.`);
    const result: unknown = await response.json().catch(() => ({}));
    const id = result && typeof result === "object" && typeof (result as { id?: unknown }).id === "string" ? (result as { id: string }).id : input.idempotencyKey;
    return { provider: "outbound_webhook", messageId: id };
  }
  const delivery = await sendEmail({
    from: input.from,
    to: input.to,
    subject: input.message.subject,
    text: input.message.text,
    html: input.message.html,
    headers: { "List-Unsubscribe": `<${extractUnsubscribe(input.message.text)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    idempotencyKey: `outreach-${input.idempotencyKey}`,
  }, input.fetcher ? { fetcher: input.fetcher } : {});
  return { provider: delivery.provider, messageId: delivery.id };
}
function extractUnsubscribe(text: string) { return text.match(/https:\/\/[^\s]+\/api\/outreach\/unsubscribe\?token=[^\s]+/)?.[0] ?? ""; }
