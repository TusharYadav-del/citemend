import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { freshBillingUrls } from "../lib/billing-portal";
import { signedUrlFresh, trustedBillingUrl } from "../lib/billing-webhook";

const oldFetch = globalThis.fetch;
const oldEnv = process.env;
afterEach(() => { globalThis.fetch = oldFetch; process.env = oldEnv; });

test("fresh signed billing links are reused and expired links are refreshed for the owned subscription", async () => {
  process.env = { ...oldEnv, LEMONSQUEEZY_API_KEY: "provider-key", NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "server-key" };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const portal = `https://store.lemonsqueezy.com/billing?expires=${expires}&signature=abc`;
  const payment = `https://store.lemonsqueezy.com/payment?expires=${expires}&signature=def`;
  const row = { id: "101", user_id: "user_123", customer_portal_url: portal, update_payment_method_url: payment };
  globalThis.fetch = async () => { throw new Error("Fresh URLs should not need a provider request."); };
  assert.equal(signedUrlFresh(portal), true);
  assert.equal((await freshBillingUrls(row)).customerPortalUrl, portal);

  let updated = false;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.lemonsqueezy.com/v1/subscriptions/101")) return Response.json({ data: { id: "101", attributes: { urls: { customer_portal: portal, update_payment_method: payment } } } });
    assert.match(String(input), /\/subscriptions\?/);
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("id"), "eq.101");
    assert.equal(url.searchParams.get("user_id"), "eq.user_123");
    assert.equal(init?.method, "PATCH");
    updated = true;
    return new Response(null, { status: 204 });
  };
  const expired = { ...row, customer_portal_url: "https://store.lemonsqueezy.com/billing?expires=1&signature=old" };
  assert.deepEqual(await freshBillingUrls(expired), { customerPortalUrl: portal, updatePaymentMethodUrl: payment });
  assert.equal(updated, true);
});

test("billing links reject HTTP, outside domains, and mismatched provider subscriptions", async () => {
  process.env = { ...oldEnv, LEMONSQUEEZY_API_KEY: "provider-key" };
  assert.equal(trustedBillingUrl("http://store.lemonsqueezy.com/billing"), null);
  assert.equal(trustedBillingUrl("https://evil.example.com/billing"), null);
  globalThis.fetch = async () => Response.json({ data: { id: "999", attributes: { urls: { customer_portal: "https://store.lemonsqueezy.com/billing" } } } });
  await assert.rejects(freshBillingUrls({ id: "101", user_id: "user_123", customer_portal_url: null, update_payment_method_url: null }), /different subscription/);
});
