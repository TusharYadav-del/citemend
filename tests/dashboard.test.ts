import assert from "node:assert/strict";
import { test } from "node:test";
import { citationHealth, normalizeDashboardDomain, redirectRule } from "../lib/audit-dashboard";
const finding = (httpStatus: number | null) => ({ url: "https://example.com/page", httpStatus, error: null, suggestedRedirect: null });
test("citation health excludes unknowns and returns no score without evidence", () => {
  assert.deepEqual(citationHealth([finding(200), finding(404), finding(500), finding(null)]), { score: 33, verified: 3, healthy: 1, unknown: 1 });
  assert.equal(citationHealth([]).score, null);
  assert.equal(citationHealth([finding(null)]).score, null);
});
test("normalizes origins and copies an actual 301 rule rather than a 308 config", () => {
  assert.equal(normalizeDashboardDomain(" https://Stripe.com/ "), "stripe.com");
  assert.throws(() => normalizeDashboardDomain("example.com/path"));
  assert.equal(redirectRule("https://example.com/old?x=1", "https://example.com/new"), 'Redirect 301 "/old" "https://example.com/new"');
  assert.throws(() => redirectRule("file:///old", "https://example.com/new"));
});

import { parseDashboardReport } from "../lib/audit-dashboard";
test("malformed report findings cannot reach the dashboard renderer", () => {
  const valid = { auditId: "test", domain: "example.com", generatedText: "answer", status: "partial", sitemapUrlCount: 3, findings: [finding(404)], warnings: [] };
  assert.equal(parseDashboardReport(valid).domain, "example.com");
  for (const invalid of [{ ...valid, findings: [null] }, { ...valid, findings: [{ ...finding(404), suggestedRedirect: "javascript:alert(1)" }] }, { ...valid, findings: [{ ...finding(404), httpStatus: "404" }] }, { ...valid, sitemapUrlCount: -1 }, { ...valid, warnings: [123] }]) assert.throws(() => parseDashboardReport(invalid), /unexpected report/);
});
