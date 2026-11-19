import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { BillingConfigError, createBillingCheckout, isBillingEnabled, productForTier } from "../lib/billing-checkout";

const oldEnv = process.env;
afterEach(() => { process.env = oldEnv; });
function configure() {
  process.env = { ...oldEnv, DODO_PAYMENTS_ENABLED: "true", DODO_PAYMENTS_API_KEY: "test-api-key", DODO_PAYMENTS_ENVIRONMENT: "test_mode",
    DODO_PRODUCT_PILOT_ID: "pdt_pilot", DODO_PRODUCT_GROWTH_ID: "pdt_growth", DODO_PRODUCT_AGENCY_ID: "pdt_agency",
    NEXT_PUBLIC_APP_URL: "https://citemend.vercel.app" };
}

test("Dodo checkout binds the authenticated owner, email, tier, product, and return path", async () => {
  configure();
  assert.equal(isBillingEnabled(), true);
  assert.deepEqual([productForTier("pilot"), productForTier("growth"), productForTier("agency")], ["pdt_pilot", "pdt_growth", "pdt_agency"]);
  let body: Record<string, unknown> | null = null;
  const url = await createBillingCheckout("pilot", "user_123", "owner@example.com", "org_456", async (_url, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ checkout_url: "https://checkout.dodopayments.com/session/abc" });
  });
  const request = body as unknown as { product_cart: Array<{ product_id: string; quantity: number }>; customer: { email: string }; metadata: Record<string, string>; return_url: string };
  assert.equal(url, "https://checkout.dodopayments.com/session/abc");
  assert.deepEqual(request.product_cart, [{ product_id: "pdt_pilot", quantity: 1 }]);
  assert.equal(request.customer.email, "owner@example.com");
  assert.deepEqual(request.metadata, { user_id: "user_123", user_email: "owner@example.com", plan_tier: "pilot", workspace_id: "org_456" });
  assert.equal(request.return_url, "https://citemend.vercel.app/dashboard?billing=success");
});

test("Dodo checkout rejects invalid identity, incomplete configuration, invalid origin, and unsafe provider URLs", async () => {
  configure();
  delete process.env.DODO_PRODUCT_PILOT_ID;
  delete process.env.DODO_PRODUCT_PILOT_ID;
  assert.throws(() => productForTier("pilot"), BillingConfigError);
  process.env.DODO_PRODUCT_PILOT_ID = "pdt_pilot";
  await assert.rejects(createBillingCheckout("pilot", "bad-user", "owner@example.com", "org_456"), /authenticated Clerk user/);
  process.env.NEXT_PUBLIC_APP_URL = "https://attacker.example.com/path";
  await assert.rejects(createBillingCheckout("pilot", "user_123", "owner@example.com", "user_123"), /trusted HTTPS origin/);
  process.env.NEXT_PUBLIC_APP_URL = "https://citemend.vercel.app";
  await assert.rejects(createBillingCheckout("pilot", "user_123", "owner@example.com", "user_123", async () => Response.json({ checkout_url: "https://evil.example.com/session" })), /untrusted checkout URL/);
  delete process.env.DODO_PRODUCT_GROWTH_ID;
  assert.equal(isBillingEnabled(), false);
});

test("Dodo checkout stays disabled until the explicit environment gate is enabled", () => {
  configure();
  delete process.env.DODO_PAYMENTS_ENABLED;
  assert.equal(isBillingEnabled(), false);
  process.env.DODO_PAYMENTS_ENABLED = "false";
  assert.equal(isBillingEnabled(), false);
  process.env.DODO_PAYMENTS_ENABLED = "true";
  assert.equal(isBillingEnabled(), true);
});
