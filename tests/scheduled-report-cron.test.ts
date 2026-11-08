import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { POST } from "../app/api/cron/scheduled-reports/route";

const reportId = "c12e67d7-0781-49c0-9c15-9c40e4814b9a";

test("scheduled-report cron requires the configured bearer secret", async () => {
  const oldSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-test-secret-value";
  let called = false;
  mock.method(globalThis, "fetch", async () => { called = true; return Response.json([]); });
  try {
    const response = await POST(new Request("http://localhost/api/cron/scheduled-reports", { method: "POST" }));
    assert.equal(response.status, 401);
    assert.equal(called, false);
  } finally {
    mock.restoreAll();
    if (oldSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = oldSecret;
  }
});

test("verificationId limits a local cron run to the seeded due report", async () => {
  const previous = { secret: process.env.CRON_SECRET, resend: process.env.RESEND_API_KEY, brevo: process.env.BREVO_API_KEY, emailFrom: process.env.EMAIL_FROM, sender: process.env.RESEND_FROM_EMAIL, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey: process.env.SUPABASE_SECRET_KEY };
  process.env.CRON_SECRET = "cron-test-secret-value";
  process.env.RESEND_API_KEY = "re_test_key";
  delete process.env.BREVO_API_KEY;
  delete process.env.EMAIL_FROM;
  process.env.RESEND_FROM_EMAIL = "CiteMend <reports@example.test>";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "service-role-test-key";
  const requests: { url: URL; method: string }[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL, options?: RequestInit) => {
    const url = new URL(String(input));
    const method = options?.method ?? "GET";
    requests.push({ url, method });
    if (url.hostname === "api.resend.com") return Response.json({ id: "resend_test_email_id" });
    if (url.pathname.endsWith("/scheduled_reports") && method === "GET") return Response.json([{ id: reportId, user_id: "test_user", workspace_domain: "test.invalid", report_type: "weekly_summary", schedule_at: new Date(Date.now() - 1_000).toISOString(), recurrence_interval: "one_time", payload_json: { recipient: "test@example.test" } }]);
    if (url.pathname.endsWith("/audits")) return Response.json({ id: "audit-test", status: "completed", created_at: new Date().toISOString() });
    if (url.pathname.endsWith("/broken_links") || url.pathname.endsWith("/ai_observation_evidence")) return Response.json([]);
    if (url.pathname.endsWith("/scheduled_reports") && method === "PATCH") return new Response(null, { status: 204 });
    throw new Error(`Unexpected test request: ${method} ${url.pathname}`);
  });
  try {
    const response = await POST(new Request(`http://localhost/api/cron/scheduled-reports?verificationId=${reportId}`, { method: "POST", headers: { authorization: "Bearer cron-test-secret-value" }, body: "{}" }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sent: 1, failed: 0, processed: 1 });
    const queueRead = requests.find(item => item.url.pathname.endsWith("/scheduled_reports") && item.method === "GET");
    assert.equal(queueRead?.url.searchParams.get("id"), `eq.${reportId}`);
    assert.equal(requests.filter(item => item.url.hostname === "api.resend.com").length, 1);
  } finally {
    mock.restoreAll();
    for (const [name, value] of Object.entries({ CRON_SECRET: previous.secret, RESEND_API_KEY: previous.resend, BREVO_API_KEY: previous.brevo, EMAIL_FROM: previous.emailFrom, RESEND_FROM_EMAIL: previous.sender, NEXT_PUBLIC_SUPABASE_URL: previous.supabaseUrl, SUPABASE_SECRET_KEY: previous.supabaseKey })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
