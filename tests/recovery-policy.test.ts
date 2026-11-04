import assert from "node:assert/strict";
import { test } from "node:test";
import { canAutoRedirect, canDeployApproved, verifyRedirectDestinations } from "../lib/recovery-policy";

test("approval state and URL state gate pixel redirects and 301 deployment", () => {
  const pending = { urlState: "404", httpStatus: 404, approvalStatus: "pending_review", similarityPercent: 94 };
  const approved = { ...pending, approvalStatus: "approved" };
  assert.equal(canAutoRedirect(pending), false);
  assert.equal(canDeployApproved(pending), false);
  assert.equal(canAutoRedirect(approved), true);
  assert.equal(canDeployApproved(approved), true);
  assert.equal(canAutoRedirect({ ...approved, similarityPercent: 69 }), false);
  assert.equal(canDeployApproved({ ...approved, similarityPercent: 69 }), false);
  assert.equal(canAutoRedirect({ ...approved, similarityPercent: null }), false);
  assert.equal(canDeployApproved({ ...approved, similarityPercent: null }), true);
  assert.equal(canAutoRedirect({ ...approved, urlState: "410" }), false);
  assert.equal(canAutoRedirect({ ...approved, approvalStatus: "rolled_back" }), false);
});

test("export and Shopify sync revalidate destinations as exact HTTP 200", async () => {
  const rules = [{ id: "live", destination: "https://example.com/live" }, { id: "redirect", destination: "https://example.com/redirect" }, { id: "unknown", destination: "https://example.com/unknown" }];
  const verified = await verifyRedirectDestinations(rules, async url => url.endsWith("/live")
    ? { state: "200", httpStatus: 200 }
    : url.endsWith("/redirect") ? { state: "301", httpStatus: 301 } : { state: "timeout", httpStatus: null });
  assert.deepEqual(verified.live, [rules[0]]);
  assert.deepEqual(verified.skipped, [rules[1], rules[2]]);
});
