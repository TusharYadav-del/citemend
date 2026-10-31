import { createLemonSqueezyCheckout } from "../lib/lemonsqueezy";

if (process.env.NODE_ENV === "production") throw new Error("Test checkout verification is development-only.");

createLemonSqueezyCheckout("user_day20_checkout_preview", true)
  .then((url) => console.log(`PASS: Lemon Squeezy created a test-mode checkout on ${new URL(url).hostname}; no payment was submitted.`))
  .catch((error) => { console.error(error instanceof Error ? error.message : "Test checkout failed."); process.exitCode = 1; });
