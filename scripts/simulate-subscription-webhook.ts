import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { POST } from "../app/api/webhooks/lemonsqueezy/route";
import { hasProSubscription } from "../lib/subscription";
import { createWeeklyScanHandler } from "../lib/weekly-scan";
import type { WeeklyDigest, WeeklyJob, WeeklyScanStore } from "../lib/weekly-scan-store";
import { renderWeeklyDigest } from "../lib/email";

if (process.env.NODE_ENV === "production") throw new Error("Webhook simulation is development-only.");

const previousFetch = globalThis.fetch;
const previousEnv = process.env;
const secret = "local-simulation-secret";
const userId = "user_day20_simulation";
let row: Record<string, unknown> | null = null;
let writes = 0;

async function send(eventName: string, status: string, cancelled: boolean, updatedAt: string, valid = true) {
  const body = JSON.stringify({
    meta: { event_name: eventName, custom_data: { user_id: userId }, test_mode: true },
    data: { type: "subscriptions", id: "900001", attributes: {
      store_id: 123, product_id: 456, variant_id: 789, status, cancelled,
      updated_at: updatedAt, ends_at: cancelled ? "2020-01-01T00:00:00Z" : null,
    } },
  });
  const signature = valid ? createHmac("sha256", secret).update(body).digest("hex") : "0".repeat(64);
  return POST(new Request("http://localhost/api/webhooks/lemonsqueezy", { method: "POST", headers: { "x-signature": signature }, body }));
}

async function main() {
  process.env = { ...previousEnv, NEXT_PUBLIC_SUPABASE_URL: "https://simulation.invalid", SUPABASE_SECRET_KEY: "simulation-key", LEMON_SQUEEZY_WEBHOOK_SECRET: secret, LEMON_SQUEEZY_STORE_ID: "123", LEMON_SQUEEZY_PRODUCT_ID: "456" };
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://simulation.invalid");
    assert.equal(url.pathname, "/rest/v1/subscriptions");
    const method = options?.method ?? "GET";
    if (method === "GET") return Response.json(row ? [row] : []);
    if (method === "POST") {
      assert.equal(row, null);
      row = JSON.parse(String(options?.body));
      writes++;
      return new Response(null, { status: 201 });
    }
    if (method === "PATCH") {
      assert.ok(row);
      row = { ...row, ...JSON.parse(String(options?.body)) };
      writes++;
      return Response.json({ id: "900001" });
    }
    throw new Error("Unexpected simulated database request.");
  };
  try {
    assert.equal((await send("subscription_created", "active", false, "2026-11-01T10:00:00Z", false)).status, 401);
    assert.equal(writes, 0);
    assert.equal((await send("subscription_created", "active", false, "2026-11-01T10:00:00Z")).status, 200);
    assert.equal(await hasProSubscription(userId), true);
    assert.equal((await send("subscription_cancelled", "cancelled", true, "2026-11-01T11:00:00Z")).status, 200);
    assert.equal(await hasProSubscription(userId), false);
    assert.equal((await send("subscription_updated", "active", false, "2026-11-01T12:00:00Z")).status, 200);
    assert.equal(await hasProSubscription(userId), true);
    assert.equal(writes, 3);
    const job = { id: "00000000-0000-4000-8000-000000000020", user_id: userId, domain: "example.com", buyer_prompt: "Find docs", attempts: 0 } as WeeklyJob;
    const digest = { id: "00000000-0000-4000-8000-000000000021", user_id: userId } as WeeklyDigest;
    let scans = 0, sent = 0, finished = 0;
    const store = {
      getOrCreateRun: async () => ({ id: "00000000-0000-4000-8000-000000000022", status: "running" }),
      candidates: async () => [job],
      claimJob: async () => ({ ...job, attempts: 1 }),
      priorAudit: async () => "none",
      finishJob: async () => {},
      prepareDigests: async () => {},
      digestCandidates: async () => [digest],
      claimDigest: async () => digest,
      digestLinks: async () => [{ domain: "example.com", audit_id: job.id, cited_url: "https://example.com/old", suggested_redirect: "https://example.com/new" }],
      finishDigest: async () => { finished++; },
      finishRunIfDone: async () => {},
    } as unknown as WeeklyScanStore;
    const handler = createWeeklyScanHandler({ secret: () => secret, store: () => store, hasPro: hasProSubscription,
      scan: async () => { scans++; },
      sendDigest: async (owner, digestId, links) => {
        assert.equal(owner, userId);
        assert.equal(digestId, digest.id);
        assert.match(renderWeeklyDigest(links).text, /Redirect 301 "\/old" "https:\/\/example.com\/new"/);
        sent++;
        return "simulated-delivery";
      },
    });
    const cron = await handler(new Request("http://localhost/api/cron/weekly-scan", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ action: "start" }) }));
    assert.equal(cron.status, 200);
    assert.equal(scans, 1);
    assert.equal(sent, 1);
    assert.equal(finished, 1);
    console.log("PASS: signed billing events, Pro access, a weekly scan job, and one redirect digest; all writes and delivery stayed in memory.");
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
