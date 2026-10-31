import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createLemonSqueezyCheckout } from "../lib/lemonsqueezy";

const oldFetch = globalThis.fetch;
const oldEnv = process.env;
afterEach(() => { globalThis.fetch = oldFetch; process.env = oldEnv; });

test("development test checkout requests test mode and retains the signed-in owner", async () => {
  process.env = { ...oldEnv, NODE_ENV: "development", LEMON_SQUEEZY_API_KEY: "test-key", LEMON_SQUEEZY_STORE_ID: "123", LEMON_SQUEEZY_PRODUCT_ID: "456", LEMON_SQUEEZY_VARIANT_ID: "789" };
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.data.attributes.test_mode, true);
    assert.equal(body.data.attributes.checkout_data.custom.user_id, "user_123");
    return Response.json({ data: { attributes: { test_mode: true, url: "https://example.lemonsqueezy.com/checkout/custom/test" } } });
  };
  assert.match(await createLemonSqueezyCheckout("user_123", true), /lemonsqueezy\.com/);
});

test("test checkout fails closed if Lemon Squeezy does not confirm test mode", async () => {
  process.env = { ...oldEnv, NODE_ENV: "development", LEMON_SQUEEZY_API_KEY: "test-key", LEMON_SQUEEZY_STORE_ID: "123", LEMON_SQUEEZY_PRODUCT_ID: "456", LEMON_SQUEEZY_VARIANT_ID: "789" };
  globalThis.fetch = async () => Response.json({ data: { attributes: { test_mode: false, url: "https://example.lemonsqueezy.com/checkout/custom/live" } } });
  await assert.rejects(createLemonSqueezyCheckout("user_123", true), /did not create a test-mode checkout/);
  process.env = { ...process.env, NODE_ENV: "production" };
  await assert.rejects(createLemonSqueezyCheckout("user_123", true), /development-only/);
});
