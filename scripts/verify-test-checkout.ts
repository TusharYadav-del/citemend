import { createBillingCheckout } from "../lib/billing-checkout";

if (process.env.NODE_ENV === "production") throw new Error("Test checkout verification is development-only.");

createBillingCheckout("pilot", "user_day20checkoutpreview", "billing-preview@example.com")
  .then((url) => console.log(`PASS: Dodo Payments created a checkout session on ${new URL(url).hostname}; no payment was submitted.`))
  .catch((error) => { console.error(error instanceof Error ? error.message : "Test checkout failed."); process.exitCode = 1; });
