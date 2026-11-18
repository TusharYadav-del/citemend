import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { dodoEventHash, dodoPilotPaymentRecord, dodoSubscriptionRecord, type DodoWebhook } from "../lib/dodo-webhook";
import { grantsProAccess } from "../lib/subscription";

const oldEnv = process.env;
afterEach(() => { process.env = oldEnv; });
function configure() {
  process.env = { ...oldEnv, NODE_ENV: "development", DODO_PAYMENTS_ENVIRONMENT: "test_mode",
    DODO_PRODUCT_PILOT_ID: "pdt_pilot", DODO_PRODUCT_GROWTH_ID: "pdt_growth", DODO_PRODUCT_AGENCY_ID: "pdt_agency" };
}
function subscription(type: string, timestamp: string, changes: Record<string, unknown> = {}): DodoWebhook {
  return { type, timestamp, business_id: "biz_123", data: {
    subscription_id: "sub_123", product_id: "pdt_growth", status: "active", created_at: timestamp,
    updated_at: timestamp, next_billing_date: "2026-12-01T00:00:00Z", cancel_at_next_billing_date: false,
    customer: { customer_id: "cus_123", email: "owner@example.com" },
    metadata: { user_id: "user_123", user_email: "owner@example.com", plan_tier: "growth" }, ...changes,
  } };
}

test("Dodo subscription events map configured products, preserve owner metadata, and honor scheduled cancellation", () => {
  configure();
  const active = dodoSubscriptionRecord(subscription("subscription.active", "2026-11-01T10:00:00Z"));
  assert.equal(active.billing_provider, "dodo");
  assert.equal(active.user_id, "user_123");
  assert.equal(active.customer_id, "cus_123");
  assert.equal(active.plan_name, "growth");
  assert.equal(active.status, "active");
  const cancelled = dodoSubscriptionRecord(subscription("subscription.cancelled", "2026-11-01T11:00:00Z", { status: "active", cancel_at_next_billing_date: true }));
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.ends_at, "2026-12-01T00:00:00.000Z");
  assert.equal(grantsProAccess(cancelled, Date.parse("2026-11-15T00:00:00Z")), true);
  const wrongProduct = subscription("subscription.active", "2026-11-01T10:00:00Z", { product_id: "unknown" });
  assert.throws(() => dodoSubscriptionRecord(wrongProduct), /configured product/);
  const wrongOwner = subscription("subscription.active", "2026-11-01T10:00:00Z", { metadata: { user_id: "user!" } });
  assert.throws(() => dodoSubscriptionRecord(wrongOwner), /configured product/);
});

test("Dodo pilot payment grants 30 days only for the configured one-time pilot product", () => {
  configure();
  const payment: DodoWebhook = { type: "payment.succeeded", timestamp: "2026-11-01T10:00:00Z", data: {
    payment_id: "pay_123", business_id: "biz_123", created_at: "2026-11-01T10:00:00Z", product_cart: [{ product_id: "pdt_pilot", quantity: 1 }],
    subscription_ids: [], customer: { customer_id: "cus_123", email: "owner@example.com" },
    metadata: { user_id: "user_123", user_email: "owner@example.com", plan_tier: "pilot" },
  } };
  const record = dodoPilotPaymentRecord(payment);
  assert.equal(record?.plan_name, "pilot");
  assert.equal(record?.ends_at, "2026-12-01T10:00:00.000Z");
  assert.equal(dodoPilotPaymentRecord({ ...payment, data: { ...payment.data, product_cart: [{ product_id: "pdt_growth", quantity: 1 }] } }), null);
});

test("Migration 039 atomically deduplicates Dodo events and enforces provider ownership and idempotency", async () => {
  configure();
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$; grant usage on schema auth to authenticated, service_role; grant execute on function auth.jwt() to authenticated, service_role;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(directory)).filter(name => /^[0-9]{3}_.+\.sql$/.test(name)).sort()) await db.exec(await readFile(new URL(file, directory), "utf8"));
    const event = subscription("subscription.active", "2026-11-01T10:00:00Z");
    const record = dodoSubscriptionRecord(event);
    const apply = async (id: string, value = record) => {
      const hash = dodoEventHash(id);
      const result = await db.query<{ result: string }>("select public.apply_dodo_billing_event($1,$2,$3::jsonb,$4::jsonb) as result", [hash, "subscription.active", JSON.stringify(event), JSON.stringify(value)]);
      return result.rows[0].result;
    };
    assert.equal(await apply("evt_1"), "processed");
    assert.equal(await apply("evt_1"), "duplicate");
    assert.equal(await apply("evt_2", { ...record, user_id: "user_other" }).then(() => "accepted", () => "rejected"), "rejected");
    const row = (await db.query<{ billing_provider: string; plan_name: string; status: string }>("select billing_provider,plan_name,status from public.subscriptions where id='sub_123'")).rows[0];
    assert.deepEqual(row, { billing_provider: "dodo", plan_name: "growth", status: "active" });
    assert.equal((await db.query<{ count: string }>("select count(*)::text as count from public.billing_webhook_events")).rows[0].count, "1");
  } finally { await db.close(); }
});
