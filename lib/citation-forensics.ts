export type ForensicKind = "discoverability" | "retrieval" | "citation_selection" | "stale_content" | "broken_destination";
export type ForensicInput = { targetUrl: string; targetStatus: number | null; inSitemap: boolean | null; robotsAllows: boolean | null; intentSimilarity: number | null; targetHasStructuredProof: boolean; citedThirdPartyHasStructuredProof: boolean; citedProofStronger?: boolean; targetUpdatedAt: string | null; citedStatus: number | null; observedCitationUrl: string | null };
export type ForensicFinding = { kind: ForensicKind; observableEvidence: string[]; diagnosticHypotheses: string[] };

/** Deterministic lexical coverage only; this is not a model-retrieval score. */
const stopWords = new Set(["the", "and", "for", "with", "from", "that", "this", "what", "which", "best", "how", "does", "can", "are", "was", "were", "have", "has", "had", "your", "you", "our", "their", "into", "about", "help", "tools"]);

function lexicalTokens(value: string): string[] {
  return value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
}

/** Deterministic lexical coverage only; this is not a model-retrieval score. */
export function measureBuyerPromptCoverage(prompt: string, title: string, claims: string[] = [], visibleText?: string): number | null {
  const terms = [...new Set(lexicalTokens(prompt))].filter(term => !stopWords.has(term));
  if (!terms.length) return null;
  const pageText = visibleText ?? `${title} ${claims.join(" ")}`;
  const pageTerms = new Set(lexicalTokens(pageText).filter(term => !stopWords.has(term)));
  if (!pageTerms.size) return null;
  return terms.filter(term => pageTerms.has(term)).length / terms.length;
}

export function compareCitationPageFacts(target: { prices: string[]; featureClaims: string[]; jsonLd: string[]; updatedAt: string | null }, cited: { prices: string[]; featureClaims: string[]; jsonLd: string[]; updatedAt: string | null }) {
  const targetClaims = new Set(target.featureClaims.map(claim => claim.toLowerCase()));
  const citedClaims = new Set(cited.featureClaims.map(claim => claim.toLowerCase()));
  return {
    targetPricesNotSeenOnCitedPage: target.prices.filter(price => !cited.prices.includes(price)),
    citedPricesNotSeenOnTarget: cited.prices.filter(price => !target.prices.includes(price)),
    targetClaimsNotSeenOnCitedPage: target.featureClaims.filter(claim => !citedClaims.has(claim.toLowerCase())),
    citedClaimsNotSeenOnTarget: cited.featureClaims.filter(claim => !targetClaims.has(claim.toLowerCase())),
    targetStructuredDataCount: target.jsonLd.length,
    citedStructuredDataCount: cited.jsonLd.length,
    targetUpdatedAt: target.updatedAt,
    citedUpdatedAt: cited.updatedAt,
  };
}

export function classifyCitationForensics(input: ForensicInput): ForensicFinding[] {
  const findings: ForensicFinding[] = [];
  if (input.inSitemap === false || input.robotsAllows === false) findings.push({ kind: "discoverability", observableEvidence: [input.inSitemap === false ? "Target URL was not found in the successfully checked sitemap." : "Robots policy disallows the target URL."], diagnosticHypotheses: ["Reduced crawler discovery may contribute to fewer retrieval opportunities."] });
  // Lexical coverage is informational only. It cannot establish a retrieval failure.
  if (input.citedThirdPartyHasStructuredProof && (!input.targetHasStructuredProof || input.citedProofStronger)) findings.push({ kind: "citation_selection", observableEvidence: [input.targetHasStructuredProof ? "The checked cited page contains more structured-data blocks than the target page." : "Checked third-party cited page contains structured proof; target page did not."], diagnosticHypotheses: ["Structured proof or external validation may have helped the cited page; selection causality is unknown."] });
  if (input.targetUpdatedAt && Number.isFinite(Date.parse(input.targetUpdatedAt)) && Date.now() - Date.parse(input.targetUpdatedAt) > 365 * 86400000) findings.push({ kind: "stale_content", observableEvidence: [`Target page timestamp is ${input.targetUpdatedAt}.`], diagnosticHypotheses: ["The visible content may be stale; the timestamp alone does not establish factual inaccuracy."] });
  if (input.targetStatus === 404 || input.targetStatus === 410 || input.citedStatus !== null && input.citedStatus >= 300 && input.citedStatus !== 304) findings.push({ kind: "broken_destination", observableEvidence: [`Target status: ${input.targetStatus ?? "unknown"}; cited source status: ${input.citedStatus ?? "unknown"}.`], diagnosticHypotheses: ["A broken destination can prevent successful retrieval or citation."] });
  return findings;
}
