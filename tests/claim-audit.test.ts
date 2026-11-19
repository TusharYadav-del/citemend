import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeAtomicClaims, normalizeCitationMetadata } from "../lib/claim-audit";

test("normalizes scholarly identifiers and citation metadata deterministically", () => {
  const metadata = normalizeCitationMetadata('Jane Smith, Alex Jones. “A Reliable Study of Facts.” Journal of Systems, 2022. doi:10.1234/example.22 PMID:12345678 arXiv:2401.12345 https://doi.org/10.1234/example.22');
  assert.equal(metadata.title, "A Reliable Study of Facts.");
  assert.equal(metadata.year, 2022);
  assert.equal(metadata.doi, "10.1234/example.22");
  assert.equal(metadata.pmid, "12345678");
  assert.equal(metadata.arxiv_id, "2401.12345");
  assert.equal(metadata.venue, "Journal of Systems, 2022");
  assert.deepEqual(metadata.authors, ["Jane Smith", "Alex Jones"]);
  assert.equal(metadata.url, "https://doi.org/10.1234/example.22");
});

test("decomposes answer statements and records review signals without asserting private reasoning", () => {
  const result = analyzeAtomicClaims({
    answer: "Acme costs $49 per month in 2024 https://example.com/pricing.\nIt was founded in 2010.\nThe paper (2022) appears in Journal of Systems, PMID:12345678.",
    prompt: "Explain the product and give exactly 3 reasons",
    citationUrls: ["https://example.com/pricing", "https://pubmed.ncbi.nlm.nih.gov/12345678/"],
    citationStatuses: { "https://example.com/pricing": 404, "https://pubmed.ncbi.nlm.nih.gov/12345678/": 200 },
    citationUpdatedAt: { "https://pubmed.ncbi.nlm.nih.gov/12345678/": "2026-01-01T00:00:00Z" },
    now: Date.parse("2026-11-19T00:00:00Z"),
  });
  assert.equal(result.claims.length, 3);
  assert.ok(result.claims[1].issues.some(item => item.code === "F2_ungrounded_claim"));
  assert.ok(result.claims[0].issues.some(item => item.code === "F6_bad_citation"));
  assert.ok(result.claims[2].issues.some(item => item.code === "F5_stale_information"));
  assert.ok(result.claims[2].issues.some(item => item.code === "F3_format_violation"));
  assert.ok(result.claims.every(claim => !claim.issues.some(item => item.code === "F1_fabricated_fact" && item.confidence === "signal")));
  assert.equal(result.issueCounts.F6_bad_citation, 1);
});

test("flags explicit exact-count instruction deviations only when a list is present", () => {
  const result = analyzeAtomicClaims({ answer: "- First reason\n- Second reason\n- Third reason\n- Fourth reason", prompt: "Give exactly 3 reasons" });
  assert.ok(result.claims[0].issues.some(item => item.code === "F4_instruction_deviation"));
  assert.ok(!analyzeAtomicClaims({ answer: "A short explanation without a list.", prompt: "Give exactly 3 reasons" }).claims.some(claim => claim.issues.some(item => item.code === "F4_instruction_deviation")));
});
