import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { createServerDatabase } from "../lib/supabase-server";
import { POST } from "../app/api/cron/scheduled-reports/route";

if (process.env.NODE_ENV === "production") throw new Error("Run this verification script locally, not in a production runtime.");

async function main() {
  const secret = process.env.CRON_SECRET?.trim();
  const recipient = process.env.TEST_REPORT_EMAIL?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  if (!secret || !recipient || !resendKey || !sender) throw new Error("Set CRON_SECRET, TEST_REPORT_EMAIL, RESEND_API_KEY, and RESEND_FROM_EMAIL in the local environment.");
  if (!/^\S+@\S+\.\S+$/.test(recipient)) throw new Error("TEST_REPORT_EMAIL must be a valid email address.");

  const db = createServerDatabase();
  const id = randomUUID();
  const domain = `cron-test-${id}.invalid`;
  try {
    const seeded = await db.from("scheduled_reports").insert({
      id,
      user_id: `cron-test-${id}`,
      workspace_domain: domain,
      report_type: "weekly_summary",
      schedule_at: new Date(Date.now() - 1_000).toISOString(),
      recurrence_interval: "one_time",
      status: "scheduled",
      payload_json: { recipient, verification: true },
    }).select("id").single();
    if (seeded.error) throw new Error(`Could not seed the scheduled report row (${seeded.error.code ?? "database error"}): ${seeded.error.message}`);

    const response = await POST(new Request(`http://localhost/api/cron/scheduled-reports?verificationId=${id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: "{}",
    }));
    const responseJson = await response.json() as { sent?: number; failed?: number; processed?: number; error?: string };
    const report = await db.from("scheduled_reports").select("status,payload_json").eq("id", id).maybeSingle();
    const payload = report.data?.payload_json as Record<string, unknown> | undefined;
    const emailId = typeof payload?.email_id === "string" ? payload.email_id : null;
    let deliveryStatus = "not-dispatched";
    if (emailId) {
      const delivery = await new Resend(resendKey).emails.get(emailId);
      if (delivery.error) throw new Error("The cron handler dispatched the message, but Resend delivery status could not be retrieved.");
      deliveryStatus = delivery.data?.last_event ?? "accepted";
    }
    console.log(JSON.stringify({ httpStatus: response.status, response: responseJson, reportStatus: report.data?.status ?? null, resendDeliveryStatus: deliveryStatus }, null, 2));
    if (!response.ok || responseJson.sent !== 1 || responseJson.failed !== 0 || !emailId) throw new Error("Scheduled report verification did not confirm a successful Resend dispatch.");
  } finally {
    await db.from("scheduled_reports").delete().eq("id", id);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Scheduled report verification failed.");
  process.exitCode = 1;
});
