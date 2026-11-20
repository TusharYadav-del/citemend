import assert from "node:assert/strict";
import { test } from "node:test";
import type { auth } from "@clerk/nextjs/server";
import { handleBillingCheckout } from "../app/api/billing/checkout/route";

test("unauthenticated checkout returns JSON 401 before creating any Dodo session", async () => {
  let dodoCalls = 0;
  const response = await handleBillingCheckout(new Request("https://citemend.test/api/billing/checkout", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: "growth" }),
  }), {
    authenticate: async () => ({ userId: null } as Awaited<ReturnType<typeof auth>>),
    createCheckout: async () => { dodoCalls++; return "https://checkout.dodopayments.com/session/never"; },
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.match((await response.json()).error, /sign in/i);
  assert.equal(dodoCalls, 0);
});
