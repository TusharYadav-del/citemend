import { Resend } from "resend";
import { randomUUID } from "node:crypto";
import { renderWeeklyDigest } from "../lib/email";

if (process.env.NODE_ENV === "production") throw new Error("Test email verification is development-only.");

async function main() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) throw new Error("Configure the Resend API key and sender first.");
  const resend = new Resend(key);
  const message = renderWeeklyDigest([{ domain: "example.com", cited_url: "https://example.com/old", suggested_redirect: "https://example.com/new", approval_status: "pending_review", audit_id: "00000000-0000-4000-8000-000000000020" }]);
  const { data, error } = await resend.emails.send({
    from, to: "delivered@resend.dev", subject: `[TEST] ${message.subject}`,
    html: message.html, text: message.text,
  }, { idempotencyKey: `day20-test-digest-${randomUUID()}` });
  if (error || !data?.id) throw new Error("Resend rejected the test digest.");
  const result = await resend.emails.get(data.id);
  if (result.error || !result.data) throw new Error("Resend accepted the test digest but its status could not be read.");
  console.log(`PASS: Resend accepted the digest for its test delivery address; latest event: ${result.data.last_event ?? "pending"}. No Pro account was emailed.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Test email failed."); process.exitCode = 1; });
