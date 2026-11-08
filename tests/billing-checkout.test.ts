import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { BillingConfigError, buildBillingCheckout, createBillingCheckout } from "../lib/billing-checkout";

const oldEnv = process.env;
const oldFetch = globalThis.fetch;
afterEach(() => { process.env = oldEnv; globalThis.fetch = oldFetch; });

function configure() {
  process.env = { ...oldEnv, LEMONSQUEEZY_API_KEY: "test-api-key", LEMONSQUEEZY_STORE_ID: "123",
    LEMONSQUEEZY_VARIANT_ID: "789", LEMONSQUEEZY_GROWTH_VARIANT_ID: "790", LEMONSQUEEZY_AGENCY_VARIANT_ID: "791",
    NEXT_PUBLIC_APP_URL: "https://siteman.vercel.app", LEMON_SQUEEZY_TEST_MODE: "true" };
}

test("checkout payload binds Clerk owner, email, plan tier, store, variant, redirect and test mode", async () => {
  configure();
  for (const [tier, variant] of [["starter", "789"], ["growth", "790"], ["agency", "791"]] as const) {
    const payload = buildBillingCheckout(tier, "user_123", "owner@example.com");
    assert.equal(payload.data.relationships.store.data.id, "123");
    assert.equal(payload.data.relationships.variant.data.id, variant);
    assert.equal(payload.data.attributes.checkout_data.email, "owner@example.com");
    assert.deepEqual(payload.data.attributes.checkout_data.custom, { user_id: "user_123", user_email: "owner@example.com", plan_tier: tier });
    assert.equal(payload.data.attributes.product_options.redirect_url, "https://siteman.vercel.app/dashboard?billing=success");
    assert.equal(payload.data.attributes.test_mode, true);
  }
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.lemonsqueezy.com/v1/checkouts");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.data.attributes.checkout_data.custom.user_id, "user_123");
    return Response.json({ data: { attributes: { test_mode: true, url: "https://store.lemonsqueezy.com/checkout/custom/abc" } } });
  };
  assert.match(await createBillingCheckout("starter", "user_123", "owner@example.com"), /checkout\/custom/);
});

test("checkout rejects unconfigured variants, invalid origins and untrusted provider URLs", async () => {
  configure();
  delete process.env.LEMONSQUEEZY_GROWTH_VARIANT_ID;
  assert.throws(() => buildBillingCheckout("growth", "user_123", "owner@example.com"), BillingConfigError);
  process.env.NEXT_PUBLIC_APP_URL = "https://attacker.example.com/path";
  assert.throws(() => buildBillingCheckout("starter", "user_123", "owner@example.com"), /trusted HTTPS origin/);
  process.env.NEXT_PUBLIC_APP_URL = "https://siteman.vercel.app";
  globalThis.fetch = async () => Response.json({ data: { attributes: { test_mode: true, url: "https://evil.example.com/checkout" } } });
  await assert.rejects(createBillingCheckout("starter", "user_123", "owner@example.com"), /untrusted checkout URL/);
});
