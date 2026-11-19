import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createBillingCheckout } from "../lib/billing-checkout";

const oldEnv = process.env;
afterEach(() => { process.env = oldEnv; });

test("Dodo pilot checkout is configured as a one-time product for the authenticated owner", async () => {
  process.env = { ...oldEnv, NODE_ENV: "development", DODO_PAYMENTS_API_KEY: "test-key", DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_PRODUCT_PILOT_ID: "pdt_pilot", NEXT_PUBLIC_APP_URL: "https://citemend.vercel.app" };
  const url = await createBillingCheckout("pilot", "user_123", "owner@example.com", "user_123", async (_input, options) => {
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(body.product_cart, [{ product_id: "pdt_pilot", quantity: 1 }]);
    assert.equal(body.metadata.user_id, "user_123");
    assert.equal(body.metadata.plan_tier, "pilot");
    return Response.json({ checkout_url: "https://checkout.dodopayments.com/session/test" });
  });
  assert.match(url, /dodopayments\.com/);
});
