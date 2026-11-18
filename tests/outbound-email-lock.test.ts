import assert from "node:assert/strict";
import { test } from "node:test";
import { sendOutreachEmail } from "../lib/outreach/sending";
import { sendEmail } from "../lib/email-provider";
import type { GeneratedOutreachEmail } from "../lib/outreach/email-generation";

const message: GeneratedOutreachEmail = {
  subject: "One verified citation URL",
  text: "One verified example: https://example.com/old",
  html: "<p>One verified example</p>",
  factualityReport: { passed: true, claims: [], checkedAt: "2026-11-18T00:00:00.000Z", approvalStatus: "pending_founder_review" },
};

for (const flag of [undefined, "false"]) {
  test(`prospect delivery never reaches any transport when OUTBOUND_EMAILS_ENABLED is ${flag ?? "unset"}`, async () => {
    const keys = ["OUTBOUND_EMAILS_ENABLED", "BREVO_API_KEY", "RESEND_API_KEY", "OUTBOUND_WEBHOOK_URL", "EMAIL_FROM"];
    const previous = new Map(keys.map(key => [key, process.env[key]]));
    try {
      if (flag === undefined) delete process.env.OUTBOUND_EMAILS_ENABLED;
      else process.env.OUTBOUND_EMAILS_ENABLED = flag;
      process.env.EMAIL_FROM = "CiteMend <sender@example.com>";
      let calls = 0;
      const fetcher: typeof fetch = async () => { calls++; return Response.json({ id: "unexpected" }); };
      for (const transport of ["brevo", "resend", "webhook"] as const) {
        process.env.BREVO_API_KEY = transport === "brevo" ? "brevo_test" : "";
        process.env.RESEND_API_KEY = transport === "resend" ? "resend_test" : "";
        process.env.OUTBOUND_WEBHOOK_URL = transport === "webhook" ? "https://outbound.example/send" : "";
        await assert.rejects(sendOutreachEmail({ idempotencyKey: "test", to: "founder@prospect.example", from: "sender@example.com", message, fetcher }), /locked/, transport);
      }
      await assert.rejects(sendEmail({ to: "founder@prospect.example", subject: "Prospect", text: "Draft", idempotencyKey: "outreach-test" }, { fetcher }), /locked/);
      assert.equal(calls, 0);
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
}

test("enabled environment still requires founder approval and completed deliverability before transport", async () => {
  const previous = process.env.OUTBOUND_EMAILS_ENABLED;
  const previousFrom = process.env.EMAIL_FROM;
  process.env.OUTBOUND_EMAILS_ENABLED = "true";
  process.env.EMAIL_FROM = "CiteMend <sender@example.com>";
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ id: "unexpected" }); };
  try {
    await assert.rejects(sendOutreachEmail({ idempotencyKey: "test", to: "founder@prospect.example", from: "sender@example.com", message, fetcher }), /founder approval/);
    await assert.rejects(sendOutreachEmail({ idempotencyKey: "test", to: "founder@prospect.example", from: "sender@example.com", message, founderApproved: true, fetcher }), /deliverability checklist/);
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.OUTBOUND_EMAILS_ENABLED; else process.env.OUTBOUND_EMAILS_ENABLED = previous;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = previousFrom;
  }
});
