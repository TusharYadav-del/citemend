import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { GET as runScheduledReports } from "../app/api/cron/scheduled-reports/route";

const oldEnv = process.env;
const oldFetch = globalThis.fetch;
afterEach(() => { process.env = oldEnv; globalThis.fetch = oldFetch; });

function setup(recipient: string, lock: string | undefined) {
  process.env = {
    ...oldEnv,
    CRON_SECRET: "cron-test-secret",
    NEXT_PUBLIC_SUPABASE_URL: "https://database.example.test",
    SUPABASE_SECRET_KEY: "server-test-secret",
    RESEND_API_KEY: "resend-test-key",
    EMAIL_FROM: "reports@citemend.test",
    FOUNDER_NOTIFICATION_EMAIL: "founder@internal.test",
  };
  if (lock === undefined) delete process.env.OUTBOUND_EMAILS_ENABLED;
  else process.env.OUTBOUND_EMAILS_ENABLED = lock;
  let providerCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.resend.com") {
      providerCalls++;
      return Response.json({ id: "sent-report-1" });
    }
    if (url.pathname.endsWith("/scheduled_reports") && init?.method === "GET") {
      return Response.json([{
        id: "schedule-1", user_id: "user_123", workspace_domain: "shop.example",
        report_type: "weekly_summary", schedule_at: "2026-11-18T00:00:00.000Z",
        recurrence_interval: "one_time", payload_json: { recipient },
      }]);
    }
    if (init?.method === "PATCH") return new Response(null, { status: 204 });
    return Response.json([]);
  };
  return () => providerCalls;
}

for (const lock of [undefined, "false"] as const) {
  test(`scheduled cron blocks arbitrary recipients when OUTBOUND_EMAILS_ENABLED is ${lock ?? "unset"}`, async () => {
    const providerCalls = setup("prospect@example.com", lock);
    const response = await runScheduledReports(new Request("https://citemend.test/api/cron/scheduled-reports", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sent: 0, failed: 0, blocked: 1, processed: 1 });
    assert.equal(providerCalls(), 0);
  });
}

test("scheduled cron still sends to the configured founder when the outbound lock is closed", async () => {
  const providerCalls = setup("founder@internal.test", undefined);
  const response = await runScheduledReports(new Request("https://citemend.test/api/cron/scheduled-reports", {
    headers: { authorization: "Bearer cron-test-secret" },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: 1, failed: 0, blocked: 0, processed: 1 });
  assert.equal(providerCalls(), 1);
});
