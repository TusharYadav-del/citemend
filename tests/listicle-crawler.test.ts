import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectThirdPartyCitations, type ListicleOpportunity } from "../lib/listicle-crawler";

test("records missing-brand listicle and up to five broken competitor links with matched user pages", async () => {
  const checked: string[] = [];
  let saved: ListicleOpportunity[] | undefined;
  let indexed = 0;
  const html = `<html><body><h1>Best tools for teams</h1>
    <a href="https://rival.com/old-pricing">Pricing</a>
    <a href="https://docs.rival.com/deprecated-guide">Guide</a>
    <a href="https://rival.com/retired-api">API</a>
    <a href="https://rival.com/old-feature">Feature</a>
    <a href="https://rival.com/legacy-plan">Legacy</a>
    <a href="https://rival.com/ignored-sixth">Sixth</a>
    <a href="mailto:editor@example.org">Email editor</a>
  </body></html>`;
  const result = await inspectThirdPartyCitations({
    auditId: "audit-1", domain: "acme.com", competitorDomains: ["rival.com"],
    thirdPartyUrls: ["https://review.example.org/best-tools"], prompt: "Best team tools?", citedEngine: "Groq+Tavily",
  }, {
    fetchArticle: async url => ({ html, status: 200, url }),
    check: async url => { checked.push(url); return 404; },
    index: async () => { indexed++; return { indexed: 0, cached: 2, urls: [] }; },
    match: async domain => ({ url: `https://${domain}/pricing`, similarity: 0.88 }),
    save: async rows => { saved = rows; },
  });
  assert.equal(checked.length, 5);
  assert.ok(!checked.some(url => url.includes("ignored-sixth")));
  assert.equal(indexed, 1);
  assert.equal(result.opportunities.filter(item => item.opportunity_type === "listicle_outbound_404").length, 5);
  const missingBrand = result.opportunities.find(item => item.opportunity_type === "listicle_missing_brand");
  assert.equal(missingBrand?.brand_mentioned, false);
  assert.equal(missingBrand?.contact_email_or_link, "mailto:editor@example.org");
  assert.equal(result.opportunities.find(item => item.opportunity_type === "listicle_outbound_404")?.matched_user_live_url, "https://acme.com/pricing");
  assert.equal(saved?.length, 6);
});

test("records cited Reddit threads without fetching them and inspects at most six third-party URLs", async () => {
  const fetched: string[] = [];
  let saved: ListicleOpportunity[] | undefined;
  const sources = ["https://old.reddit.com/r/example/comments/abc/topic", ...Array.from({ length: 7 }, (_, index) => `https://source${index}.example.org/article`)];
  const result = await inspectThirdPartyCitations({
    auditId: "audit-2", domain: "acme.com", competitorDomains: [], thirdPartyUrls: sources,
    prompt: "Best tools?", citedEngine: "Groq+Tavily",
  }, {
    fetchArticle: async url => { fetched.push(url); return { html: "<html><body>Acme is a great product.</body></html>", status: 200, url }; },
    save: async rows => { saved = rows; },
  });
  assert.equal(fetched.length, 5);
  assert.ok(!fetched.some(url => url.includes("reddit")));
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].opportunity_type, "reddit_citation_thread");
  assert.equal(result.opportunities[0].target_url, sources[0]);
  assert.equal(saved?.length, 1);
});
