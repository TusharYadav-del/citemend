import { createWeeklyScanHandler } from "../lib/weekly-scan";
import { createServerDatabase } from "../lib/supabase-server";
import { grantsProAccess } from "../lib/subscription";

if (process.env.NODE_ENV === "production") throw new Error("Local cron verification is development-only.");

async function main() {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("CRON_SECRET is missing.");
  const subscriptions = await createServerDatabase().from("subscriptions").select("status,cancelled,ends_at");
  if (subscriptions.error) throw new Error("Could not check Pro eligibility before the manual cron trigger.");
  const eligible = (subscriptions.data ?? []).filter((item) => grantsProAccess(item)).length;
  console.log(`Eligible Pro subscription rows: ${eligible}.`);
  const handler = createWeeklyScanHandler();
  const response = await handler(new Request("http://localhost/api/cron/weekly-scan", {
    method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ action: "drain" }),
  }));
  const result = await response.json();
  console.log(`Manual weekly drain: HTTP ${response.status}, status ${result.status ?? "error"}, processed ${result.processed ?? 0}.`);
  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Cron verification failed."); process.exitCode = 1; });
