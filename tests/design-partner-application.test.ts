import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesignPartnerApplicationHandler, type DesignPartnerApplicationRow } from "../lib/design-partner-application";
import type { ForensicTeaserReport } from "../lib/forensic-teaser";

const teaser: ForensicTeaserReport = {
  domain: "example.com", status: "partial", runMode: "page_only", diagnosticSummary: "Public page checks completed.",
  citationSummary: { modeledAnswerAvailable: false, ownDomainUrlMentions: null, verifiedBrokenUrls: null, missingCitationCount: null, brokenOrMissingCount: null },
  pageEvidence: { httpStatus: 200, sitemapCheckAvailable: false, homepageInSitemap: null, robotsAllows: true, structuredDataBlocks: 0, lastModified: null, extractionStatus: "available", extractedTextLength: 120, extractedTextPreview: "Example page content", lexicalPromptCoverage: null },
  findings: [], limits: [],
};
const payload = {
  contactName: "Sam Example", contactEmail: "SAM@example.com", companyName: "Example Co", domain: "www.example.com",
  segment: "agency", clientOrCatalogSize: 8, buyerPrompt: "best customer support platform", primaryPainPoint: "AI answers cite expired resource pages.",
};
function post(body: unknown, origin = "https://citemend.test") {
  return new Request("https://citemend.test/api/design-partners/apply", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
}

test("design partner application validates, runs the teaser, and persists the normalized application", async () => {
  const rows: DesignPartnerApplicationRow[] = [];
  let scanned: [string, string] | null = null;
  const handle = createDesignPartnerApplicationHandler({
    consumeRateLimit: async () => true,
    runTeaser: async (domain, prompt) => { scanned = [domain, prompt]; return teaser; },
    saveApplication: async (application) => { rows.push(application); },
  });
  const response = await handle(post(payload));
  assert.equal(response.status, 201);
  assert.deepEqual(scanned, ["example.com", "best customer support platform"]);
  assert.equal(rows[0]?.contactEmail, "sam@example.com");
  assert.equal(rows[0]?.teaserStatus, "partial");
  assert.deepEqual(rows[0]?.teaser, teaser);
  const result = await response.json() as { received: boolean; teaserStatus: string };
  assert.equal(result.received, true);
  assert.equal(result.teaserStatus, "partial");
});

test("application is saved with an unavailable teaser if external scan providers fail", async () => {
  const savedRows: DesignPartnerApplicationRow[] = [];
  const handle = createDesignPartnerApplicationHandler({ consumeRateLimit: async () => true, runTeaser: async () => { throw new Error("provider unavailable"); }, saveApplication: async (row) => { savedRows.push(row); } });
  const response = await handle(post(payload));
  assert.equal(response.status, 201);
  assert.equal(savedRows[0]?.teaserStatus, "unavailable");
  assert.equal(savedRows[0]?.teaser, null);
});

test("application rate limit, cross-origin protection, and save errors fail closed", async () => {
  let scanned = 0;
  const base = { runTeaser: async () => { scanned++; return teaser; }, saveApplication: async () => {} };
  const limited = createDesignPartnerApplicationHandler({ consumeRateLimit: async () => false, ...base });
  assert.equal((await limited(post(payload))).status, 429);
  const crossOrigin = createDesignPartnerApplicationHandler({ consumeRateLimit: async () => true, ...base });
  assert.equal((await crossOrigin(post(payload, "https://attacker.test"))).status, 403);
  assert.equal(scanned, 0);
  const failedSave = createDesignPartnerApplicationHandler({ consumeRateLimit: async () => true, runTeaser: async () => teaser, saveApplication: async () => { throw new Error("db down"); } });
  assert.equal((await failedSave(post(payload))).status, 503);
});

test("agency application sizing stays within the stated 5 to 50 client track", async () => {
  let teaserCalls = 0;
  const handle = createDesignPartnerApplicationHandler({ consumeRateLimit: async () => true, runTeaser: async () => { teaserCalls++; return teaser; }, saveApplication: async () => {} });
  assert.equal((await handle(post({ ...payload, clientOrCatalogSize: 4 }))).status, 400);
  assert.equal((await handle(post({ ...payload, clientOrCatalogSize: 51 }))).status, 400);
  assert.equal(teaserCalls, 0);
});
