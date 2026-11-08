import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { GET as testEmailRoute } from "../app/api/health/test-email/route";
import { sendFounderAlertEmail } from "../lib/founder-alerts";

const originalFetch = globalThis.fetch;
const originalEnv = process.env;
afterEach(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });

function configure(values: Record<string, string | undefined>) {
  process.env = { ...originalEnv };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("founder delivery uses Resend first even when Brevo is configured", async () => {
  configure({ RESEND_API_KEY: "re_test", BREVO_API_KEY: "brevo_test", FOUNDER_NOTIFICATION_EMAIL: "founder@example.test", EMAIL_FROM: "CiteMend <owner@gmail.com>" });
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const result = await sendFounderAlertEmail({ subject: "Founder alert", text: "A beta request arrived." }, {
    fetcher: async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return Response.json({ id: "resend_founder_123" });
    },
  });

  assert.deepEqual(result, { sent: true, provider: "resend", messageId: "resend_founder_123" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].body.from, "CiteMend <onboarding@resend.dev>");
});

test("founder delivery falls back to Brevo after a Resend error and preserves its status/body", async () => {
  configure({ RESEND_API_KEY: "re_test", BREVO_API_KEY: "brevo_test", FOUNDER_NOTIFICATION_EMAIL: "founder@outlook.com", EMAIL_FROM: "CiteMend <sender@gmail.com>" });
  const calls: string[] = [];
  const result = await sendFounderAlertEmail({ subject: "Founder alert", text: "A beta request arrived." }, {
    fetcher: async (input) => {
      const url = String(input);
      calls.push(url);
      return url.includes("resend.com")
        ? Response.json({ message: "sender not verified" }, { status: 403 })
        : Response.json({ messageId: "<brevo_founder_456>" });
    },
  });

  assert.deepEqual(calls, ["https://api.resend.com/emails", "https://api.brevo.com/v3/smtp/email"]);
  assert.deepEqual(result, { sent: true, provider: "brevo", messageId: "<brevo_founder_456>" });
});

test("Brevo same-Gmail rejection returns the exact status and response body", async () => {
  configure({ RESEND_API_KEY: undefined, BREVO_API_KEY: "brevo_test", FOUNDER_NOTIFICATION_EMAIL: "same@gmail.com", EMAIL_FROM: "CiteMend <same@gmail.com>" });
  const body = '{"code":"sender_recipient_match","message":"blocked by policy"}';
  const previousWarn = console.warn;
  let warning = "";
  console.warn = (...args: unknown[]) => { warning = args.map(String).join(" "); };
  try {
    const result = await sendFounderAlertEmail({ subject: "Founder alert", text: "Test" }, {
      fetcher: async () => new Response(body, { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    assert.equal(result.sent, false);
    assert.equal(result.provider, "none");
    assert.ok(result.error?.includes(`Brevo HTTP 400: ${body}`));
    assert.match(warning, /same Gmail address/i);
  } finally { console.warn = previousWarn; }
});

test("browser email diagnostic attempts both providers and reports only env presence", async () => {
  configure({ NODE_ENV: "development", RESEND_API_KEY: "re_test", BREVO_API_KEY: "brevo_test", FOUNDER_NOTIFICATION_EMAIL: undefined, RESEND_FROM_EMAIL: "CiteMend <sender@example.test>", EMAIL_FROM: undefined });
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(String(input));
    const body = JSON.parse(String(init?.body)) as { subject?: string };
    assert.equal(body.subject, "CiteMend Beta Acceptance & Founder Alert Test");
    return String(input).includes("resend.com") ? Response.json({ id: "resend_diag_1" }) : Response.json({ messageId: "brevo_diag_1" });
  };

  const response = await testEmailRoute(new Request("http://localhost:3000/api/health/test-email"));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(calls.sort(), ["https://api.brevo.com/v3/smtp/email", "https://api.resend.com/emails"]);
  assert.deepEqual(result.envCheck, { RESEND_API_KEY: true, BREVO_API_KEY: true, FOUNDER_NOTIFICATION_EMAIL: false, RESEND_FROM_EMAIL: true });
  assert.deepEqual(result.resendResult, { status: 200, data: { id: "resend_diag_1" }, error: null });
  assert.deepEqual(result.brevoResult, { status: 200, data: { messageId: "brevo_diag_1" }, error: null });
});

test("browser email diagnostic is unavailable outside development", async () => {
  configure({ NODE_ENV: "production" });
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; return Response.json({}); };
  const response = await testEmailRoute(new Request("https://citemend.com/api/health/test-email"));
  assert.equal(response.status, 404);
  assert.equal(fetched, false);
});
