import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { POST } from "../app/api/webhooks/lemonsqueezy/route";
import { applyPaymentEventState, deliveryHash, subscriptionRecord } from "../lib/billing-webhook";
import { grantsProAccess } from "../lib/subscription";

const oldFetch = globalThis.fetch;
const oldEnv = process.env;
afterEach(() => { globalThis.fetch = oldFetch; process.env = oldEnv; });

function configure(nodeEnv: "development" | "production" | "test" = "development") {
  process.env = { ...oldEnv, NODE_ENV: nodeEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "server-key",
    LEMONSQUEEZY_WEBHOOK_SECRET: "webhook-secret", LEMONSQUEEZY_STORE_ID: "123", LEMONSQUEEZY_VARIANT_ID: "789",
    LEMONSQUEEZY_AGENCY_VARIANT_ID: "2336501", LEMON_SQUEEZY_TEST_MODE: "false", RESEND_API_KEY: "", BREVO_API_KEY: "" };
}

function subscription(eventName: string, updatedAt = "2026-11-01T10:00:00Z", changes: Record<string, unknown> = {}) {
  return { meta: { event_name: eventName, custom_data: { user_id: "user_123", user_email: "owner@example.com", plan_tier: "starter" } },
    data: { type: "subscriptions", id: "101", attributes: { store_id: 123, product_id: 456, variant_id: 789,
      customer_id: 222, order_id: 333, status: "active", cancelled: false, test_mode: false, updated_at: updatedAt, ...changes } } };
}

function deliver(payload: unknown, valid = true) {
  const body = JSON.stringify(payload);
  const signature = valid ? createHmac("sha256", "webhook-secret").update(body).digest("hex") : "0".repeat(64);
  return POST(new Request("http://localhost/api/webhooks/lemonsqueezy", { method: "POST", headers: { "x-signature": signature }, body }));
}

test("webhook verifies HMAC, applies once, and rejects duplicate delivery before another mutation", async () => {
  configure();
  const hashes = new Set<string>();
  let mutations = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("/billing_webhook_events")) {
      const hash = new URL(String(input)).searchParams.get("event_hash")?.replace(/^eq\./, "") ?? "";
      return Response.json(hashes.has(hash) ? [{ id: "already-processed" }] : []);
    }
    assert.match(String(input), /\/rpc\/apply_billing_webhook_event$/);
    const body = JSON.parse(String(init?.body));
    if (hashes.has(body.p_hash)) return Response.json("duplicate");
    hashes.add(body.p_hash); mutations++;
    assert.equal(body.p_record.user_id, "user_123");
    assert.equal(body.p_record.plan_name, "starter");
    return Response.json("processed");
  };
  const event = subscription("subscription_created");
  assert.equal((await deliver(event, false)).status, 401);
  assert.equal(mutations, 0);
  assert.equal((await deliver(event)).status, 200);
  const duplicate = await deliver(event);
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { duplicate: true });
  assert.equal(mutations, 1);
});

test("production rejects signed test deliveries before billing storage", async () => {
  configure("production");
  globalThis.fetch = async () => { throw new Error("Test billing must not reach storage."); };
  const event = subscription("subscription_created", "2026-11-01T10:00:00Z", { test_mode: true });
  event.meta = { ...event.meta, test_mode: true } as typeof event.meta;
  const response = await deliver(event);
  assert.equal(response.status, 403);
});

test("invoice payment failure uses the provider subscription snapshot and records past due", async () => {
  configure();
  process.env.LEMONSQUEEZY_API_KEY = "provider-key";
  process.env.RESEND_API_KEY = "resend-key";
  process.env.EMAIL_FROM = "CiteMend <onboarding@resend.dev>";
  let saved: Record<string, unknown> | null = null;
  const alertKeys: string[] = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("/billing_webhook_events")) return Response.json([]);
    if (String(input).includes("api.lemonsqueezy.com/v1/subscriptions/101")) return Response.json(subscription("subscription_updated", "2026-11-01T11:00:00Z", { status: "past_due" }));
    if (String(input).includes("api.resend.com/emails")) {
      alertKeys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      return Response.json({ id: `email-${alertKeys.length}` });
    }
    assert.match(String(input), /\/rpc\/apply_billing_webhook_event$/);
    saved = JSON.parse(String(init?.body)).p_record;
    return Response.json("processed");
  };
  const invoice = { meta: { event_name: "subscription_payment_failed", custom_data: { user_id: "user_123", user_email: "owner@example.com", plan_tier: "starter" } },
    data: { type: "subscription-invoices", id: "501", attributes: { subscription_id: 101, test_mode: false, status: "pending", updated_at: "2026-11-01T11:00:00Z" } } };
  assert.equal((await deliver(invoice)).status, 200);
  const stored = saved as unknown as Record<string, unknown>;
  assert.equal(stored.status, "past_due");
  assert.equal(stored.id, "101");
  assert.equal(alertKeys.length, 2);
  assert.notEqual(alertKeys[0], alertKeys[1]);
});

test("payment failure overrides an earlier active snapshot but never reverses a later recovery", () => {
  configure();
  const active = subscriptionRecord(subscription("subscription_updated", "2026-11-01T10:00:00Z"), "subscription_updated");
  assert.equal(applyPaymentEventState(active, "subscription_payment_failed", { updated_at: "2026-11-01T11:00:00Z" }).status, "past_due");
  const recovered = subscriptionRecord(subscription("subscription_updated", "2026-11-01T12:00:00Z"), "subscription_updated");
  assert.equal(applyPaymentEventState(recovered, "subscription_payment_failed", { updated_at: "2026-11-01T11:00:00Z" }).status, "active");
  const pastDue = subscriptionRecord(subscription("subscription_updated", "2026-11-01T11:00:00Z", { status: "past_due" }), "subscription_updated");
  assert.equal(applyPaymentEventState(pastDue, "subscription_payment_recovered", { status: "paid", updated_at: "2026-11-01T12:00:00Z" }).status, "active");
});

test("atomic billing migration deduplicates, preserves ownership, and handles cancellation grace then expiry", async () => {
  configure();
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$; grant usage on schema auth to authenticated, service_role; grant execute on function auth.jwt() to authenticated, service_role;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(directory)).filter(name => /^\d{3}_.+\.sql$/.test(name)).sort()) await db.exec(await readFile(new URL(file, directory), "utf8"));
    const apply = async (event: ReturnType<typeof subscription>) => {
      const raw = JSON.stringify(event);
      const eventName = event.meta.event_name;
      const hash = deliveryHash(raw, eventName, event.data.id);
      const record = subscriptionRecord(event, eventName);
      const result = await db.query<{ result: string }>("select public.apply_billing_webhook_event($1,$2,$3::jsonb,$4::jsonb) as result", [hash, eventName, raw, JSON.stringify(record)]);
      return result.rows[0].result;
    };
    const active = subscription("subscription_created");
    assert.equal(await apply(active), "processed");
    assert.equal(await apply(active), "duplicate");
    const cancelled = subscription("subscription_cancelled", "2026-11-01T11:00:00Z", { status: "cancelled", cancelled: true, ends_at: "2026-12-01T00:00:00Z" });
    assert.equal(await apply(cancelled), "processed");
    let row = (await db.query<{ user_id: string; status: string; cancelled: boolean; ends_at: string | null; plan_name: string }>("select user_id,status,cancelled,ends_at,plan_name from public.subscriptions where id='101'")).rows[0];
    assert.equal(grantsProAccess(row, Date.parse("2026-11-15T00:00:00Z")), true);
    assert.equal(row.plan_name, "starter");
    assert.equal(await apply(subscription("subscription_updated", "2026-11-01T10:30:00Z")), "ignored");
    const hijack = subscription("subscription_updated", "2026-11-01T12:00:00Z");
    hijack.meta.custom_data.user_id = "user_other";
    await assert.rejects(apply(hijack), /Subscription owner mismatch/);
    const expired = subscription("subscription_expired", "2026-12-01T01:00:00Z", { status: "expired", cancelled: true, ends_at: "2026-12-01T00:00:00Z" });
    assert.equal(await apply(expired), "processed");
    row = (await db.query<typeof row>("select user_id,status,cancelled,ends_at,plan_name from public.subscriptions where id='101'")).rows[0];
    assert.equal(grantsProAccess(row, Date.parse("2026-12-02T00:00:00Z")), false);
    assert.equal((await db.query<{ count: string }>("select count(*)::text as count from public.billing_webhook_events")).rows[0].count, "4");
    await db.exec("set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"other_user\"}', false);");
    assert.equal((await db.query<{ count: string }>("select count(*)::text as count from public.subscriptions")).rows[0].count, "0");
    await db.exec("select set_config('request.jwt.claims', '{\"sub\":\"user_123\"}', false);");
    assert.equal((await db.query<{ count: string }>("select count(*)::text as count from public.subscriptions")).rows[0].count, "1");
    await assert.rejects(db.exec("update public.subscriptions set status='active' where id='101'"));
  } finally { await db.close(); }
});
