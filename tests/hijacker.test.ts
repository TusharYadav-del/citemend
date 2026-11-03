import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyCitationUrl, findCompetitor404Opportunities, inferCompetitorDomains } from "../lib/hijacker";

test("classifies own, explicitly listed competitor, and third-party citation URLs", () => {
  assert.equal(classifyCitationUrl("https://docs.acme.com/pricing", "acme.com", ["rival.com"]).bucket, "own_domain");
  assert.equal(classifyCitationUrl("https://shop.rival.com/old-plan", "acme.com", ["rival.com"]).bucket, "competitor_domain");
  assert.equal(classifyCitationUrl("https://reddit.com/r/saas/comments/1", "acme.com", ["rival.com"]).bucket, "third_party_source");
  assert.equal(classifyCitationUrl("javascript:alert(1)", "acme.com", ["rival.com"]).bucket, "third_party_source");
});

test("infers at most three explicitly named citation domains and leaves review sources out", () => {
  assert.deepEqual(inferCompetitorDomains("acme.com", [
    "https://rival.com/pricing", "https://another.io/product", "https://third.dev/compare",
    "https://fourth.org/home", "https://trustpilot.com/review/rival.com",
  ], "Rival at rival.com and Another at another.io, Third at third.dev; also Fourth fourth.org."), ["another.io", "fourth.org", "rival.com"]);
});

test("checks competitor citations and stores semantic own-domain match for 404 and 410 pages", async () => {
  const checked: string[] = [];
  let indexed = 0;
  let stored: unknown[] = [];
  const result = await findCompetitor404Opportunities({
    auditId: "audit-1", domain: "acme.com", competitorDomains: ["rival.com"],
    citationUrls: ["https://acme.com/docs", "https://rival.com/old-pricing", "https://rival.com/retired-feature", "https://reddit.com/r/example"],
    prompt: "Compare pricing", citedEngine: "Groq+Tavily", responseText: "Acme provides documentation.",
  }, {
    check: async url => { checked.push(url); return url.endsWith("old-pricing") ? 404 : 410; },
    index: async () => { indexed++; return { indexed: 0, cached: 1, urls: ["https://acme.com/pricing"] }; },
    embed: async () => [1, ...Array(767).fill(0)],
    search: async domain => {
      assert.equal(domain, "acme.com");
      return [{ url: "https://acme.com/pricing", similarity: 0.91 }];
    },
    save: async rows => { stored = rows; },
  });
  assert.deepEqual(checked, ["https://rival.com/old-pricing", "https://rival.com/retired-feature"]);
  assert.equal(indexed, 1);
  assert.equal(result.classifications.length, 4);
  assert.equal(result.opportunities.length, 2);
  assert.equal(stored.length, 2);
  assert.equal(result.opportunities[0].matched_user_live_url, "https://acme.com/pricing");
  assert.equal(result.opportunities[0].similarity_score, 0.91);
  assert.equal(result.opportunities[1].http_status, 410);
});
