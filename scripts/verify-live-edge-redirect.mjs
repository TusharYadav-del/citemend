import { randomUUID } from "node:crypto";

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error("Configure the server-only Supabase URL and key.");

const path = `/old-__citemend_day23_${randomUUID()}`;
const headers = { apikey: key, "Content-Type": "application/json", Prefer: "return=representation" };
const endpoint = `${base}/rest/v1/redirect_rules`;
let id;
try {
  const insert = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: "day23-verification", source_host: "localhost", source_path: path, destination: "https://localhost/new", active: true }),
    signal: AbortSignal.timeout(12000),
  });
  if (!insert.ok) throw new Error(`Temporary rule insert failed: HTTP ${insert.status}`);
  const rows = await insert.json();
  id = rows[0]?.id;
  if (!id) throw new Error("Temporary rule ID was missing.");

  const response = await fetch(`http://localhost:8787${path}`, { redirect: "manual", signal: AbortSignal.timeout(12000) });
  console.log(`Worker result: HTTP ${response.status}`);
  if (response.status !== 301 || response.headers.get("location") !== "https://localhost/new") throw new Error("Worker did not use the live Supabase redirect rule.");

  const disable = await fetch(`${endpoint}?id=eq.${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ active: false }),
    signal: AbortSignal.timeout(12000),
  });
  if (!disable.ok) throw new Error(`Temporary rule deactivation failed: HTTP ${disable.status}`);
  await new Promise((resolve) => setTimeout(resolve, 6000));
  const afterDisable = await fetch(`http://localhost:8787${path}`, { redirect: "manual", signal: AbortSignal.timeout(12000) });
  console.log(`After deactivation: HTTP ${afterDisable.status}`);
  if (afterDisable.status !== 404) throw new Error("Worker kept redirecting after the rule was disabled.");
} finally {
  if (id) {
    const remove = await fetch(`${endpoint}?id=eq.${id}`, { method: "DELETE", headers, signal: AbortSignal.timeout(12000) });
    if (!remove.ok) throw new Error(`Temporary rule cleanup failed: HTTP ${remove.status}`);
    console.log("Temporary rule removed.");
  }
}
