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
  const deliveryLogs = new Map<string, Record<string, unknown>>();
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const method = init?.method ?? "GET";
    const url = new URL(String(input));
    if (url.pathname.endsWith("/webhook_events_log")) {
      const eventId = url.searchParams.get("event_id")?.replace(/^eq\./, "") ?? "";
      if (method === "GET") return Response.json(deliveryLogs.has(eventId) ? [deliveryLogs.get(eventId)] : []);
      if (method === "POST") { const value = JSON.parse(String(init?.body)); if (deliveryLogs.has(value.event_id)) return Response.json({ code: "23505", message: "duplicate" }, { status: 409 }); deliveryLogs.set(value.event_id, value); return new Response(null, { status: 201 }); }
      if (method === "PATCH") { const value = JSON.parse(String(init?.body)); deliveryLogs.set(eventId, { ...deliveryLogs.get(eventId), ...value }); return new Response(null, { status: 204 }); }
    }
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
  const duplicate = await send("subscription_created", "2026-11-01T10:00:00Z", "active", false);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal((row as Record<string, unknown> | null)?.status, "cancelled");
  assert.equal((await send("subscription_updated", "2026-11-01T12:00:00Z", "active", false, null)).status, 200);
  assert.equal((row as Record<string, unknown> | null)?.status, "active");
  assert.equal((await send("subscription_updated", "2026-11-01T13:00:00Z", "active", false, "other_user")).status, 400);
  assert.equal((row as Record<string, unknown> | null)?.user_id, "user_123");
});

test("signed Agency variant is accepted for its store and records the actual product and Agency plan", async () => {
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key", LEMON_SQUEEZY_WEBHOOK_SECRET: "webhook-secret", LEMON_SQUEEZY_STORE_ID: "123", LEMON_SQUEEZY_PRODUCT_ID: "456", LEMON_SQUEEZY_AGENCY_VARIANT_ID: "2336501" };
  let stored: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/webhook_events_log")) return new Response(null, { status: init?.method === "PATCH" ? 204 : 201 });
    if ((init?.method ?? "GET") === "GET") return Response.json([]);
    stored = JSON.parse(String(init?.body));
    return new Response(null, { status: 201 });
  };
  const send = (variant: number, store = 123) => {
    const event = { meta: { event_name: "subscription_created", custom_data: { user_id: "agency_owner" } }, data: { type: "subscriptions", id: "102", attributes: { store_id: store, product_id: 999, variant_id: variant, status: "active", cancelled: false, updated_at: "2026-11-01T10:00:00Z" } } };
    const body = JSON.stringify(event);
    return POST(new Request("http://localhost/api/webhooks/lemonsqueezy", { method: "POST", headers: { "x-signature": createHmac("sha256", "webhook-secret").update(body).digest("hex") }, body }));
  };
  assert.equal((await send(2336501, 999)).status, 400);
  assert.equal((await send(99999)).status, 400);
  assert.equal((await send(2336501)).status, 200);
  assert.equal(stored?.product_id, "999");
  assert.equal(stored?.variant_id, "2336501");
  assert.equal(stored?.plan, "agency");
  assert.equal(stored?.user_id, "agency_owner");
});

test("production ignores signed test-mode Agency subscriptions", async () => {
  process.env = { ...oldEnv, NODE_ENV: "production", LEMON_SQUEEZY_WEBHOOK_SECRET: "webhook-secret", LEMON_SQUEEZY_STORE_ID: "123", LEMON_SQUEEZY_PRODUCT_ID: "456", LEMON_SQUEEZY_AGENCY_VARIANT_ID: "2336501" };
  globalThis.fetch = async () => { throw new Error("Test event must not touch storage"); };
  const body = JSON.stringify({ meta: { event_name: "subscription_created", custom_data: { user_id: "agency_owner" } }, data: { type: "subscriptions", id: "103", attributes: { store_id: 123, product_id: 999, variant_id: 2336501, status: "active", updated_at: "2026-11-01T10:00:00Z", test_mode: true } } });
  const response = await POST(new Request("http://localhost/api/webhooks/lemonsqueezy", { method: "POST", headers: { "x-signature": createHmac("sha256", "webhook-secret").update(body).digest("hex") }, body }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored, true);
});
