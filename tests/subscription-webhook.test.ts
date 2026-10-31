import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import { POST } from "../app/api/webhooks/lemonsqueezy/route";

const oldFetch = globalThis.fetch;
const oldEnv = process.env;
afterEach(() => { globalThis.fetch = oldFetch; process.env = oldEnv; });

test("signed subscription events cannot replace newer billing state or change its owner", async () => {
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key", LEMON_SQUEEZY_WEBHOOK_SECRET: "webhook-secret", LEMON_SQUEEZY_STORE_ID: "123", LEMON_SQUEEZY_PRODUCT_ID: "456" };
  let row: Record<string, unknown> | null = null;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const method = init?.method ?? "GET";
    if (method === "GET") return Response.json(row ? [row] : []);
    if (method === "POST") { row = JSON.parse(String(init?.body)); return new Response(null, { status: 201 }); }
    if (method === "PATCH") {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("user_id"), "eq.user_123");
      assert.ok(url.searchParams.getAll("provider_updated_at").includes(`eq.${row?.provider_updated_at}`));
      row = { ...row, ...JSON.parse(String(init?.body)) };
      return Response.json({ id: "101" });
    }
    throw new Error("Unexpected database request");
  };
  const send = (eventName: string, updatedAt: string, status: string, cancelled: boolean, userId: string | null = "user_123", valid = true) => {
    const event = { meta: { event_name: eventName, custom_data: userId ? { user_id: userId } : {} }, data: { type: "subscriptions", id: "101", attributes: { store_id: 123, product_id: 456, variant_id: 789, status, cancelled, updated_at: updatedAt, ends_at: cancelled ? "2026-12-01T00:00:00Z" : null } } };
    const body = JSON.stringify(event);
    const signature = valid ? createHmac("sha256", "webhook-secret").update(body).digest("hex") : "0".repeat(64);
    return POST(new Request("http://localhost/api/webhooks/lemonsqueezy", { method: "POST", headers: { "x-signature": signature }, body }));
  };
  assert.equal((await send("subscription_created", "2026-11-01T10:00:00Z", "active", false, "user_123", false)).status, 401);
  assert.equal(calls, 0);
  assert.equal((await send("subscription_created", "2026-11-01T10:00:00Z", "active", false)).status, 200);
  assert.equal((await send("subscription_cancelled", "2026-11-01T11:00:00Z", "cancelled", true, null)).status, 200);
  assert.equal((await send("subscription_created", "2026-11-01T10:00:00Z", "active", false)).status, 200);
  assert.equal((row as Record<string, unknown> | null)?.status, "cancelled");
  assert.equal((await send("subscription_updated", "2026-11-01T12:00:00Z", "active", false, null)).status, 200);
  assert.equal((row as Record<string, unknown> | null)?.status, "active");
  assert.equal((await send("subscription_updated", "2026-11-01T13:00:00Z", "active", false, "other_user")).status, 400);
  assert.equal((row as Record<string, unknown> | null)?.user_id, "user_123");
});
