import assert from "node:assert/strict";
import { test } from "node:test";
import { citationHealth, normalizeDashboardDomain, redirectRule } from "../lib/audit-dashboard";
import { historyMetrics } from "../lib/history-metrics";
import type { UserAuditHistoryItem } from "../lib/audit-history";
import type { UrlState } from "../lib/seo";
const finding = (httpStatus: number | null) => ({ url: "https://example.com/page", httpStatus, urlState: (httpStatus === 404 ? "404" : httpStatus === 410 ? "410" : httpStatus === 301 ? "301" : httpStatus === 200 ? "200" : "unknown") as UrlState, error: null, suggestedRedirect: null });
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

test("accepts explicit unsaved reports and rejects contradictory persistence states", () => {
  const report = { auditId: null, persistence: {status: "failed"}, domain: "example.com", generatedText: "answer", status: "partial", sitemapUrlCount: 0, findings: [], warnings: ["Not saved"] };
  assert.equal(parseDashboardReport(report).auditId, null);
  assert.throws(() => parseDashboardReport({...report, persistence: {status: "saved"}}));
  assert.throws(() => parseDashboardReport({...report, auditId: "pretend-id"}));
});

test("history cards count current 404s and ready redirects from each domain's latest scan", () => {
  const audit = (id: string, domain: string, date: string, links: UserAuditHistoryItem["broken_links"]): UserAuditHistoryItem => ({ id, domain, created_at: date, status: "completed", share_of_model_score: 0, engine_matrix_json: [], broken_links: links });
  const defaults = { url_state: "404", approval_status: "pending_review", match_confidence: null, match_evidence_reason: null };
  const oldLink = { ...defaults, id: "old", cited_url: "https://example.com/old", http_status: 404, suggested_redirect: null };
  const currentLink = { ...defaults, id: "current", cited_url: "https://example.com/current", http_status: 404, suggested_redirect: "https://example.com/new" };
  const unresolved = { ...defaults, id: "unresolved", cited_url: "https://example.com/unresolved", http_status: 404, suggested_redirect: null };
  const healthy = { ...defaults, url_state: "200", id: "healthy", cited_url: "https://example.com/healthy", http_status: 200, suggested_redirect: null };
  assert.deepEqual(historyMetrics([
    audit("older", "example.com", "2026-01-01T00:00:00Z", [oldLink]),
    audit("other", "other.com", "2026-01-03T00:00:00Z", [unresolved]),
    audit("latest", "example.com", "2026-01-02T00:00:00Z", [currentLink, healthy]),
  ]), { totalScans: 3, active404s: 2, redirectsReady: 1 });
  assert.deepEqual(historyMetrics([]), { totalScans: 0, active404s: 0, redirectsReady: 0 });
});
