import assert from "node:assert/strict";
import { test } from "node:test";
import { getVerticalSolutionPageModel, verticalSolutions } from "@/lib/vertical-solutions";
import { buildPublicVerifiedBenchmarks } from "@/lib/benchmark-aggregator";
import { buildAgencyReferralLink, createAgencyReferralCode, createAgencyReferralTrackingHandler, getAgencyReferralCookie } from "@/lib/agency-referrals";

test("vertical solution route model renders the expected conversion paths and copy", () => {
  assert.deepEqual(Object.keys(verticalSolutions).sort(), ["agencies", "ecommerce", "enterprise", "saas"]);
  const route = getVerticalSolutionPageModel("agencies");
  assert.ok(route);
  assert.equal(route.ctaHref, "/dashboard#workspaces");
  assert.deepEqual(route.relatedLinks, ["/integrations", "/benchmarks"]);
  assert.match(verticalSolutions.agencies.eyebrow, /5–50 clients/);
  assert.match(verticalSolutions.saas.highlights.map((item) => item.title).join(" "), /buyer-intent prompt monitoring/i);
  assert.match(verticalSolutions.ecommerce.highlights.map((item) => item.title).join(" "), /Shopify catalog sync/i);
  assert.match(verticalSolutions.enterprise.highlights.map((item) => item.title).join(" "), /SSO and RBAC/i);
});

test("agency referrals create safe co-branded links and count visits without storing visitor identifiers", async () => {
  const code = createAgencyReferralCode("0123456789abcdef01234567");
  assert.equal(code, "agency_0123456789abcdef01234567");
  const link = new URL(buildAgencyReferralLink("https://citemend.example", code, { domain: "shop.example", agency: "Northwind" }));
  assert.equal(link.pathname, "/forensic-scan");
  assert.equal(link.searchParams.get("ref"), code);
  assert.equal(link.searchParams.get("domain"), "shop.example");
  assert.equal(link.searchParams.get("agency"), "Northwind");
  let seenCode: string | null = null;
  let visitWrites = 0;
  const handler = createAgencyReferralTrackingHandler({ recordVisit: async (value) => { seenCode = value; visitWrites += 1; return true; } });
  const response = await handler(new Request(`https://citemend.example/api/agency-referrals/track?ref=${code}`, { method: "POST", headers: { origin: "https://citemend.example", "x-forwarded-for": "203.0.113.4" } }));
  assert.equal(response.status, 200);
  assert.equal(seenCode, code);
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly; SameSite=Lax; Secure/);
  const requestWithCookie = new Request("https://citemend.example", { headers: { cookie: response.headers.get("set-cookie")!.split(";")[0] } });
  assert.equal(getAgencyReferralCookie(requestWithCookie), code);
  assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /203\.0\.113\.4/);
  const repeated = await handler(new Request(`https://citemend.example/api/agency-referrals/track?ref=${code}`, { method: "POST", headers: { cookie: response.headers.get("set-cookie")!.split(";")[0] } }));
  assert.equal(repeated.status, 200);
  assert.equal(seenCode, code);
  assert.equal(visitWrites, 1, "a returning browser with the same referral cookie does not increment visit again");
  const invalid = await handler(new Request("https://citemend.example/api/agency-referrals/track?ref=not-valid", { method: "POST" }));
  assert.equal(invalid.status, 400);
  const crossOrigin = await handler(new Request(`https://citemend.example/api/agency-referrals/track?ref=${code}`, { method: "POST", headers: { origin: "https://attacker.example" } }));
  assert.equal(crossOrigin.status, 403);
});

function evidence(index: number, status: number, allow = true) {
  return {
    workspaceKey: `workspace-${index}`,
    workspaceDomain: `site-${index}.example`,
    allowBenchmarkAggregation: allow,
    modelName: "Search profile A",
    jobStatus: "completed",
    extractedUrls: [`https://site-${index}.example/product`],
    urlStatus: { [`https://site-${index}.example/product`]: status },
  };
}

test("verified benchmarks use opt-in workspaces only and suppress sub-five-workspace segments", () => {
  const opted = Array.from({ length: 5 }, (_, index) => evidence(index, index === 0 ? 404 : 200));
  const result = buildPublicVerifiedBenchmarks([...opted, evidence(5, 410, false)]);
  assert.equal(result.available, true);
  assert.equal(result.model404Rates.length, 1);
  assert.equal(result.model404Rates[0].rate, 20);
  assert.equal(result.model404Rates[0].confidenceInterval.sample_size, 5);
  assert.equal(result.model404Rates[0].confidenceInterval.sample_size_warning, null);
  assert.doesNotMatch(JSON.stringify(result), /workspace-|site-\d+\.example|product/);

  const lowSample = buildPublicVerifiedBenchmarks(opted.slice(0, 4));
  assert.equal(lowSample.available, false);
  assert.equal(lowSample.model404Rates.length, 0);
  assert.equal(lowSample.forensicCauses.length, 0);
  assert.equal(buildPublicVerifiedBenchmarks(opted.map((row) => ({ ...row, allowBenchmarkAggregation: false }))).available, false);

  const allBroken = buildPublicVerifiedBenchmarks(Array.from({ length: 5 }, (_, index) => evidence(index, 404)));
  assert.equal(allBroken.forensicCauses[0]?.cause, "broken_destination");
  assert.equal(allBroken.forensicCauses[0]?.confidenceInterval.sample_size, 5);
});
