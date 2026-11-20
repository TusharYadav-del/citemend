import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { billingReturnUrl, billingSignInHref } from "../lib/billing-flow";

test("pricing and dashboard upgrade actions post the selected paid tier to Dodo checkout", async () => {
  const button = await readFile(new URL("../components/billing-checkout-button.tsx", import.meta.url), "utf8");
  const pricing = await readFile(new URL("../app/pricing/page.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../components/billing-panel.tsx", import.meta.url), "utf8");
  const upgrade = await readFile(new URL("../components/upgrade-modal.tsx", import.meta.url), "utf8");
  const checkoutRoute = await readFile(new URL("../app/api/billing/checkout/route.ts", import.meta.url), "utf8");
  const signIn = await readFile(new URL("../app/sign-in/[[...sign-in]]/page.tsx", import.meta.url), "utf8");
  const signUp = await readFile(new URL("../app/sign-up/[[...sign-up]]/page.tsx", import.meta.url), "utf8");

  assert.match(button, /fetch\("\/api\/billing\/checkout"[\s\S]*?method: "POST"[\s\S]*?JSON\.stringify\(\{ tier \}\)/);
  assert.match(button, /response\.status === 401[\s\S]*?billingSignInHref\(tier\)/);
  assert.match(button, /window\.location\.assign\(url\.href\)/);
  assert.match(signIn, /signUpUrl=\{signUpUrl\}/);
  assert.match(signUp, /forceRedirectUrl=\{returnTo\}/);
  assert.match(signUp, /signInUrl=\{signInUrl\}/);
  assert.doesNotMatch(button, /beta-request|SignInButton|betaMode/i);
  for (const tier of ["pilot", "growth", "agency"]) {
    assert.match(pricing, new RegExp(`tier: "${tier}"`));
    assert.match(panel, new RegExp(`"${tier}"`));
    assert.match(upgrade, new RegExp(`tier="${tier}"`));
  }
  assert.match(pricing, /!billingReady\s*&&/);
  assert.doesNotMatch(pricing, /Ask about availability|\/api\/beta-request/);
  assert.match(checkoutRoute, /export async function GET\(\)[\s\S]*?status: 405[\s\S]*?Allow: "POST"/);
  assert.doesNotMatch(checkoutRoute, /mode: isBillingEnabled\(\) \? "billing" : "beta"/);
});

test("public paid-plan sign-in preserves the selected tier and returns from Dodo to billing", () => {
  for (const tier of ["pilot", "growth", "agency"] as const) {
    assert.equal(billingSignInHref(tier), `/sign-in?redirect_url=${encodeURIComponent(`/dashboard/billing?checkout=${tier}`)}`);
    assert.equal(billingReturnUrl("https://citemend.example", tier), `https://citemend.example/dashboard/billing?billing=success&checkout=${tier}`);
  }
});
