import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSoftwareOfferSchema, extractPricingFacts } from "../lib/entity-truth";

test("extracts canonical pricing text while excluding navigation and scripts", () => {
  const text = extractPricingFacts(`<html><nav>Navigation</nav><main><h1>Pricing</h1><p>Free plan available. Pro costs $12 per month.</p><script>secret()</script></main><footer>Footer</footer></html>`);
  assert.match(text, /Free plan available/);
  assert.match(text, /\$12 per month/);
  assert.doesNotMatch(text, /Navigation|Footer|secret/);
});

test("creates a SoftwareApplication Offer schema grounded in supplied pricing facts", () => {
  const schema = JSON.parse(buildSoftwareOfferSchema("acme.com", "Free plan available; Pro is $12/month."));
  assert.equal(schema["@type"], "SoftwareApplication");
  assert.equal(schema.offers["@type"], "Offer");
  assert.match(schema.offers.description, /\$12\/month/);
});
