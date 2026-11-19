import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeFreeAuditMetadata, normalizeFreeAuditUrl, runFreeProvenanceAudit } from "../lib/free-provenance-audit";

test("free auditor only accepts public HTTP pages and strips fragments", () => {
  assert.equal(normalizeFreeAuditUrl("Example.com/old#section"), "https://example.com/old");
  for (const value of ["http://localhost/", "http://127.0.0.1/", "https://example.com:8443/", "file:///tmp/file", "https://name:pass@example.com/", "https://example.internal/"]) {
    assert.throws(() => normalizeFreeAuditUrl(value));
  }
});

test("metadata signal requires a valid canonical and reports only observed tags", () => {
  const result = analyzeFreeAuditMetadata('<html><head><title>Guide</title><meta name="description" content="Useful guide"><link rel="canonical" href="/guide"><script type="application/ld+json">{}</script></head></html>', "https://example.com/guide");
  assert.deepEqual(result, { titlePresent: true, descriptionPresent: true, canonicalPresent: true, canonical: "https://example.com/guide", canonicalMatchesHost: true, jsonLdBlockCount: 1, jsonLdValidCount: 1 });
  assert.equal(analyzeFreeAuditMetadata('<link rel="canonical" href="javascript:alert(1)">', "https://example.com/").canonicalPresent, false);
});

test("404 audit checks Wayback and keeps robots access separate from crawler proof", async () => {
  const calls: string[] = [];
  const report = await runFreeProvenanceAudit("https://example.com/gone", {
    fetcher: async value => {
      const url = String(value); calls.push(url);
      return url.endsWith("/robots.txt") ? new Response("User-agent: GPTBot\nDisallow: /gone\n", { status: 200 }) : new Response("Not found", { status: 404 });
    },
    wayback: async value => { calls.push(`archive:${value}`); return { url: "https://web.archive.org/web/20260101000000/https://example.com/gone", capturedAt: "2026-01-01T00:00:00Z", originalStatus: 200 }; },
  });
  assert.equal(report.linkState, "permanent_dead");
  assert.equal(report.crawlerAccess.GPTBot, false);
  assert.equal(report.crawlerAccess.ClaudeBot, true);
  assert.equal(report.navigationLinkCount, null);
  assert.equal(report.waybackSnapshot?.originalStatus, 200);
  assert.equal(calls.filter(value => value.startsWith("archive:")).length, 1);
});

test("live page audit checks HTML metadata and does not ask Wayback", async () => {
  let archiveCalls = 0;
  const links = Array.from({ length: 60 }, (_, index) => `<a href="/${index}">Link ${index}</a>`).join("");
  const report = await runFreeProvenanceAudit("https://example.com/guide", {
    fetcher: async value => String(value).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response(`<html><head><title>Guide</title></head><body><nav>${links}</nav><main>${"Helpful visible content ".repeat(12)}</main></body></html>`, { status: 200, headers: { "Content-Type": "text/html" } }),
    wayback: async () => { archiveCalls++; return null; },
  });
  assert.equal(report.httpStatus, 200);
  assert.equal(report.navigationLinkCount, 60);
  assert.equal(report.navigationBloat, true);
  assert.equal(report.metadata?.titlePresent, true);
  assert.equal(archiveCalls, 0);
});
