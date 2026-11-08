import assert from "node:assert/strict";
import { test } from "node:test";
import { sendEmail } from "../lib/email-provider";

function withEnvironment(values: Record<string, string | undefined>, run: () => Promise<void>) {
  return async () => {
    const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try { await run(); }
    finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
}

test("Resend personal sender domains use its verified onboarding sender and preserve reply-to", withEnvironment({
  BREVO_API_KEY: undefined,
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: undefined,
  RESEND_FROM_EMAIL: 'CiteMend <founder@gmail.com>',
}, async () => {
  let captured: { from: string; replyTo?: string } | undefined;
  const result = await sendEmail({ to: "prospect@example.test", subject: "Evidence", text: "Verified finding" }, {
    sendResend: async (_apiKey, _message, from, replyTo) => { captured = { from, replyTo }; return "resend_test_id"; },
  });

  assert.deepEqual(captured, { from: "CiteMend <onboarding@resend.dev>", replyTo: "founder@gmail.com" });
  assert.deepEqual(result, { provider: "resend", id: "resend_test_id" });
}));

test("Brevo keeps a Gmail sender and sends through its native REST API", withEnvironment({
  BREVO_API_KEY: "brevo_test_key",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: 'CiteMend <founder@gmail.com>',
  RESEND_FROM_EMAIL: "ignored@example.test",
}, async () => {
  let captured: { url: string; init: RequestInit; payload: Record<string, unknown> } | undefined;
  const result = await sendEmail({ to: "prospect@example.test", subject: "Evidence", text: "Verified finding" }, {
    fetcher: async (input, init) => {
      captured = { url: String(input), init: init ?? {}, payload: JSON.parse(String(init?.body)) as Record<string, unknown> };
      return Response.json({ messageId: "<brevo_test_id>" });
    },
  });

  assert.equal(captured?.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(captured?.init.method, "POST");
  assert.equal(new Headers(captured?.init.headers).get("api-key"), "brevo_test_key");
  assert.deepEqual(captured?.payload.sender, { name: "CiteMend", email: "founder@gmail.com" });
  assert.deepEqual(captured?.payload.replyTo, { name: "CiteMend", email: "founder@gmail.com" });
  assert.deepEqual(result, { provider: "brevo", id: "<brevo_test_id>" });
}));
