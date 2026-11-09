import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, mock, test } from "node:test";
import dns from "node:dns/promises";
import { deduplicateProspects } from "../lib/outreach/discovery";
import { verifyContactEmail } from "../lib/outreach/email-verification";
import { researchCompany } from "../lib/outreach/company-research";
import { scoreProspect } from "../lib/outreach/qualification";
import { generateEvidenceBackedEmail, validateFactualityReport } from "../lib/outreach/email-generation";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../lib/outreach/suppression";
import { verifyResendSignature } from "../lib/outreach/resend-signature";
afterEach(() => mock.restoreAll());

test("deduplicates prospects by normalized domain while retaining the first evidence-backed row", () => {
  const rows = ["example.com", "example.com", "other.co.uk"].map((domain, index) => ({ domain, companyName: `Company ${index}`, category: "SEO", country: "US", websiteUrl: `https://${domain}`, sourceUrl: `https://${domain}/about`, excerpt: "Public source" }));
  assert.deepEqual(deduplicateProspects(rows).map(row => row.domain), ["example.com", "other.co.uk"]);
});

test("research verifies URLs in the generated provider answer, not search results alone", async () => {
  const prospect = { domain:"acme.example",companyName:"Acme",category:"B2B SaaS",country:"US",websiteUrl:"https://acme.example",sourceUrl:"https://acme.example/about",excerpt:"A public company profile." };
  const result = await researchCompany(prospect, {
    probe: async () => ({ text:"Acme is listed at https://acme.example/old-path", citedUrls:["https://search.example/unrelated"], providerUsed:"groq-test", searchGrounding:{status:"available",sources:[{title:"Search",url:"https://search.example/unrelated"}]}, warnings:[] }),
    verify: async url => ({ state:url.endsWith("old-path")?"404":"200",httpStatus:url.endsWith("old-path")?404:200 }),
  });
  assert.equal(result.answerProvider,"groq-test");
  assert.deepEqual(result.citationEvidence.map(item=>[item.url,item.state]),[["https://acme.example/old-path","404"]]);
});

test("validates MX, syntax, disposable and role contacts distinctly", async () => {
  mock.method(dns, "resolveMx", async () => [{ exchange: "mx.example.com", priority: 10 }]);
  assert.equal((await verifyContactEmail("person@example.com")).status, "verified");
  assert.equal((await verifyContactEmail("sales@example.com")).status, "risky");
  assert.equal((await verifyContactEmail("person@another.example", { expectedDomain: "example.com" })).status, "invalid");
  assert.equal((await verifyContactEmail("name@mailinator.com")).status, "disposable");
  assert.equal((await verifyContactEmail("bad-address")).status, "invalid");
  mock.restoreAll();
  mock.method(dns, "resolveMx", async () => { throw Object.assign(new Error("dns timeout"), { code: "ETIMEOUT" }); });
  assert.equal((await verifyContactEmail("person@unknown.example")).status, "unknown");
});

test("scores prospects against the complete 100 point rubric and enforces hard gates", () => {
  const all = scoreProspect({ companyFit: true, decisionMaker: true, aiPresence: true, citationStates: ["404"], technicalSeo: true, contactStatus: "verified", personalizationEvidence: true });
  assert.equal(all.score, 100); assert.equal(all.eligible, true);
  const noBroken = scoreProspect({ companyFit: true, decisionMaker: true, aiPresence: true, citationStates: ["unknown"], technicalSeo: true, contactStatus: "verified", personalizationEvidence: true });
  assert.equal(noBroken.score, 75); assert.equal(noBroken.eligible, false);
  const risky = scoreProspect({ companyFit: true, decisionMaker: true, aiPresence: true, citationStates: ["410"], technicalSeo: true, contactStatus: "risky", personalizationEvidence: true });
  assert.equal(risky.score, 90); assert.equal(risky.eligible, false);
});

test("outreach uses one verified example and waits for founder review", () => {
  const example = { deadUrl: "https://acme.example/old-product", status: 404 as const, detectedAt: "2026-11-09T10:00:00.000Z", referrerUrl: "https://publisher.example/best-tools", referrerContext: "Acme is listed in the category guide.", replacementUrl: "https://acme.example/products/current", replacementReason: "Same product family and use case; destination returned HTTP 200." };
  const email = generateEvidenceBackedEmail({ companyName: "Acme", contactName: "Jane Doe", domain: "acme.example", email: "jane@acme.example", appOrigin: "https://citemend.example", tokenSecret: "test-secret", evidence: [example] });
  assert.ok(email); assert.equal(validateFactualityReport(email.factualityReport), true);
  assert.match(email.text, /\/report\/acme\.example/);
  assert.match(email.text, /\/api\/outreach\/unsubscribe\?token=/);
  assert.match(email.text, /Observed HTTP status: 404/);
  assert.match(email.text, /Detection date: 2026-11-09/);
  assert.match(email.text, /Suggested live replacement: https:\/\/acme\.example\/products\/current/);
  assert.match(email.text, /Would you like me to share the full self-serve report/);
  assert.equal(email.factualityReport.approvalStatus, "pending_founder_review");
  assert.equal(generateEvidenceBackedEmail({ companyName: "Acme", domain: "acme.example", email: "jane@acme.example", appOrigin: "https://citemend.example", tokenSecret: "test-secret", evidence: [{ ...example, replacementUrl: null, replacementReason: null }] }), null);
  assert.equal(generateEvidenceBackedEmail({ companyName: "Acme", domain: "acme.example", email: "jane@acme.example", appOrigin: "https://citemend.example", tokenSecret: "test-secret", evidence: [example, example] }), null);
});

test("unsubscribe token round trips, rejects tampering, and webhook signature rejects replay or altered body", () => {
  const token = createUnsubscribeToken("Jane@Example.com", "test-secret");
  assert.equal(verifyUnsubscribeToken(token, "test-secret"), "jane@example.com");
  assert.equal(verifyUnsubscribeToken(`${token}x`, "test-secret"), null);
  const raw = JSON.stringify({ type: "email.delivered" }), id = "evt_123", timestamp = String(Math.floor(Date.now() / 1000));
  const secret = Buffer.from("unit-test-secret").toString("base64");
  const signature = createHmac("sha256", Buffer.from(secret,"base64")).update(`${id}.${timestamp}.${raw}`).digest("base64");
  const headers = { id, timestamp, signature: `v1,${signature}` };
  assert.equal(verifyResendSignature(raw, headers, `whsec_${secret}`), true);
  assert.equal(verifyResendSignature(`${raw}x`, headers, `whsec_${secret}`), false);
  assert.equal(verifyResendSignature(raw, { ...headers, timestamp: "1" }, `whsec_${secret}`), false);
});

test("daily cron route rejects requests without the configured bearer secret", async () => {
  const previous = process.env.CRON_SECRET; process.env.CRON_SECRET = "known-test-secret";
  try {
    const { POST } = await import("../app/api/cron/outreach/daily/route");
    const response = await POST(new Request("https://citemend.example/api/cron/outreach/daily", { method: "POST" }));
    assert.equal(response.status, 401);
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});

test("reply webhook rejects requests without a valid signature before database access", async () => {
  const previous = process.env.OUTREACH_REPLY_WEBHOOK_SECRET; process.env.OUTREACH_REPLY_WEBHOOK_SECRET = "known-test-secret";
  try {
    const { POST } = await import("../app/api/webhooks/outreach/reply/route");
    const response = await POST(new Request("https://citemend.example/api/webhooks/outreach/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_id: "evt", provider_message_id: "outbound-id", from: "founder@example.com" }) }));
    assert.equal(response.status, 401);
  } finally { if (previous === undefined) delete process.env.OUTREACH_REPLY_WEBHOOK_SECRET; else process.env.OUTREACH_REPLY_WEBHOOK_SECRET = previous; }
});
