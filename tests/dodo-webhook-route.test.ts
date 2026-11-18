import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import { POST } from "../app/api/webhooks/dodo/route";

const oldEnv = process.env;
const oldFetch = globalThis.fetch;
afterEach(() => { process.env = oldEnv; globalThis.fetch = oldFetch; });

test("Dodo webhook processing stays disabled until its explicit environment gate is enabled", async () => {
  process.env = { ...oldEnv, DODO_PAYMENTS_ENABLED: "false", DODO_PAYMENTS_API_KEY: "test-api-key", DODO_PAYMENTS_WEBHOOK_KEY: "test-secret",
    DODO_PRODUCT_PILOT_ID: "pdt_pilot", DODO_PRODUCT_GROWTH_ID: "pdt_growth", DODO_PRODUCT_AGENCY_ID: "pdt_agency" };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  const response = await POST(new Request("https://citemend.test/api/webhooks/dodo", { method: "POST", body: "{}" }));
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test("Dodo route verifies Standard Webhooks signatures and acknowledges duplicate webhook IDs", async () => {
  const webhookKey = `whsec_${Buffer.from("test-signing-secret").toString("base64")}`;
  process.env = { ...oldEnv, NODE_ENV: "test", DODO_PAYMENTS_ENABLED: "true", DODO_PAYMENTS_API_KEY: "test-api-key", DODO_PAYMENTS_WEBHOOK_KEY: webhookKey,
    DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_PRODUCT_PILOT_ID: "pdt_pilot", DODO_PRODUCT_GROWTH_ID: "pdt_growth", DODO_PRODUCT_AGENCY_ID: "pdt_agency",
    NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "server-key" };
  let dbCalls = 0;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/rpc\/apply_dodo_billing_event$/);
    assert.equal(init?.method, "POST");
    dbCalls++;
    return Response.json(dbCalls === 1 ? "processed" : "duplicate");
  };
  const event = {
    type: "subscription.active", business_id: "biz_123", timestamp: new Date().toISOString(),
    data: { subscription_id: "sub_123", product_id: "pdt_growth", status: "active", updated_at: new Date().toISOString(),
      customer: { customer_id: "cus_123", email: "owner@example.com" },
      metadata: { user_id: "user_123", user_email: "owner@example.com", plan_tier: "growth" } },
  };
  const body = JSON.stringify(event);
  const webhookId = "msg_delivery_123";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(webhookKey.slice("whsec_".length), "base64"))
    .update(`${webhookId}.${timestamp}.${body}`).digest("base64");
  const deliver = (value: string) => POST(new Request("https://citemend.test/api/webhooks/dodo", { method: "POST", body, headers: {
    "webhook-id": webhookId, "webhook-timestamp": timestamp, "webhook-signature": value,
  } }));
  assert.equal((await deliver("v1,invalid")).status, 401);
  assert.equal(dbCalls, 0);
  assert.equal((await deliver(`v1,${signature}`)).status, 200);
  const duplicate = await deliver(`v1,${signature}`);
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { duplicate: true });
  assert.equal(dbCalls, 2);
});
