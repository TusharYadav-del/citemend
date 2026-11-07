import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { extractPageEntity } from "../lib/entity-consistency";
import { classifyCitationForensics, measureBuyerPromptCoverage } from "../lib/citation-forensics";
import { createForensicTeaserHandler, normalizeTeaserDomain, summarizeTeaserDiagnosis, teaserRateLimitKey, type ForensicTeaserReport } from "../lib/forensic-teaser";

const report: ForensicTeaserReport = {
  domain: "example.com", status: "complete", runMode: "page_only", diagnosticSummary: "No blocker signal was observable.",
  citationSummary: { modeledAnswerAvailable: false, ownDomainUrlMentions: null, verifiedBrokenUrls: null, missingCitationCount: null, brokenOrMissingCount: null },
  pageEvidence: { httpStatus: 200, sitemapCheckAvailable: true, homepageInSitemap: true, robotsAllows: true, structuredDataBlocks: 0, lastModified: null, extractionStatus: "unknown", extractedTextLength: 0, extractedTextPreview: "", lexicalPromptCoverage: null },
  findings: [], limits: ["One prompt is a limited sample."],
};
const request = (body: unknown) => new Request("https://citemend.test/api/forensics/teaser", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("public forensic teaser validates domains and rejects loopback targets before consuming rate limit", async () => {
  assert.equal(normalizeTeaserDomain("https://www.Example.com/"), "example.com");
  assert.throws(() => normalizeTeaserDomain("127.0.0.1"), /public DNS hostname/);
  let limited = 0;
  const handle = createForensicTeaserHandler({ consumeRateLimit: async () => { limited++; return true; }, run: async () => report });
  assert.equal((await handle(request({ domain: "localhost", buyerPrompt: "best support platform" }))).status, 400);
  assert.equal(limited, 0);
});

test("teaser stops at injected rate limit and does not run a public scan", async () => {
  let runs = 0;
  const handle = createForensicTeaserHandler({ consumeRateLimit: async () => false, run: async () => { runs++; return report; } });
  const response = await handle(request({ domain: "example.com", buyerPrompt: "best support platform" }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(runs, 0);
});

test("teaser returns injected observable report when under the rate limit", async () => {
  const handle = createForensicTeaserHandler({ consumeRateLimit: async () => true, run: async (domain, prompt) => { assert.equal(domain, "example.com"); assert.equal(prompt, "best support platform"); return report; } });
  const response = await handle(request({ domain: "www.example.com", buyerPrompt: " best support platform " }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), report);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("rate-limit HMAC keys are stable and purpose scoped", () => {
  const previous = process.env.CITEMEND_PUBLIC_RATE_LIMIT_SECRET;
  process.env.CITEMEND_PUBLIC_RATE_LIMIT_SECRET = "unit-test-secret";
  try {
    const req = new Request("https://citemend.test", { headers: { "x-real-ip": "203.0.113.4" } });
    assert.equal(teaserRateLimitKey(req, "scan"), teaserRateLimitKey(req, "scan"));
    assert.notEqual(teaserRateLimitKey(req, "scan"), teaserRateLimitKey(req, "application"));
  } finally {
    if (previous === undefined) delete process.env.CITEMEND_PUBLIC_RATE_LIMIT_SECRET;
    else process.env.CITEMEND_PUBLIC_RATE_LIMIT_SECRET = previous;
  }
});

test("CiteMend homepage wording extracts useful text without a false zero-overlap retrieval blocker", () => {
  const homepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const page = extractPageEntity("homepage", "https://citemend.com/", homepage);
  assert.ok(page.visibleText.length > 100, "visible copy is extracted from the homepage source");
  assert.match(page.visibleText, /Find broken AI citations|inspect cited URLs/i);
  const coverage = measureBuyerPromptCoverage("Which tools help repair broken citations from AI search answers?", page.title, page.featureClaims, page.visibleText);
  assert.ok(coverage !== null && coverage > 0, "normalized visible copy should overlap buyer intent terms");
  const findings = classifyCitationForensics({ targetUrl: page.url, targetStatus: 200, inSitemap: true, robotsAllows: true, intentSimilarity: 0, targetHasStructuredProof: true, citedThirdPartyHasStructuredProof: false, targetUpdatedAt: null, citedStatus: null, observedCitationUrl: null });
  assert.ok(!findings.some(item => item.kind === "retrieval"), "lexical overlap alone is informational, not a blocker");
  assert.equal(summarizeTeaserDiagnosis({ httpStatus: 200, verifiedBrokenUrls: 0, blockerKinds: [] }), "No Verified Citation Failure Detected");
});
