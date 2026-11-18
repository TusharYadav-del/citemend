import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createBillingPortalSession } from "../lib/billing-portal";

const oldEnv = process.env;
afterEach(() => { process.env = oldEnv; });

test("Dodo portal sessions are customer-scoped and return to the billing panel", async () => {
  process.env = { ...oldEnv, DODO_PAYMENTS_ENABLED: "true", DODO_PAYMENTS_API_KEY: "test-key", DODO_PAYMENTS_ENVIRONMENT: "test_mode", NEXT_PUBLIC_APP_URL: "https://citemend.vercel.app" };
  let requestBody: Record<string, unknown> | null = null;
  let requestUrl = "";
  const url = await createBillingPortalSession("cus_123abc", "user_123", async (input, init) => {
    requestUrl = String(input);
    if (init?.body) requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return Response.json({ link: "https://customer.dodopayments.com/portal/abc" });
  });
  assert.equal(url, "https://customer.dodopayments.com/portal/abc");
  assert.equal(requestBody, null);
  const parsed = new URL(requestUrl);
  assert.match(parsed.pathname, /\/customers\/cus_123abc\/customer-portal\/session$/);
  assert.equal(parsed.searchParams.get("return_url"), "https://citemend.vercel.app/dashboard#billing");
});

test("Dodo portal rejects invalid customer identifiers and untrusted provider links", async () => {
  process.env = { ...oldEnv, DODO_PAYMENTS_ENABLED: "true", DODO_PAYMENTS_API_KEY: "test-key", DODO_PAYMENTS_ENVIRONMENT: "test_mode" };
  await assert.rejects(createBillingPortalSession("101", "user_123"), /valid Dodo customer/);
  await assert.rejects(createBillingPortalSession("cus_123abc", "user_123", async () => Response.json({ link: "https://evil.example.com/portal" })), /untrusted customer portal URL/);
  process.env.NEXT_PUBLIC_APP_URL = "https://attacker.example.com/path";
  await assert.rejects(createBillingPortalSession("cus_123abc", "user_123", async () => { throw new Error("Provider must not be called."); }), /trusted HTTPS origin/);
});
