export type DeadUrlClassification = "high_intent_recoverable" | "leave_as_404_or_410" | "redirect_risk_detected";

export type RecoveryCandidate = {
  url: string;
  sameDomain: boolean;
  confidence: number | null;
  semanticallyEquivalent: boolean;
  commerciallyEquivalent: boolean;
  httpStatus: number | null;
  redirectHops?: number;
  loopDetected?: boolean;
};

export function classifyDeadUrl(input: {
  deadStatus: number;
  candidate?: RecoveryCandidate | null;
  confidenceThreshold?: number;
}): { classification: DeadUrlClassification; reason: string; badRecommendationPrevented: boolean } {
  const candidate = input.candidate;
  if (candidate && (candidate.loopDetected || (candidate.redirectHops ?? 0) > 1 || candidate.httpStatus !== 200)) {
    return { classification: "redirect_risk_detected", reason: candidate.loopDetected ? "Candidate redirects to a loop." : (candidate.redirectHops ?? 0) > 1 ? "Candidate uses a multi-hop redirect chain." : "Candidate does not currently resolve to HTTP 200.", badRecommendationPrevented: true };
  }
  const threshold = input.confidenceThreshold ?? 85;
  const equivalent = candidate?.sameDomain === true && candidate.semanticallyEquivalent === true && candidate.commerciallyEquivalent === true;
  const confident = candidate?.confidence !== null && candidate?.confidence !== undefined && candidate.confidence >= threshold && candidate.confidence <= 100;
  if ((input.deadStatus === 404 || input.deadStatus === 410) && candidate && equivalent && confident) {
    return { classification: "high_intent_recoverable", reason: "A live, same-domain candidate meets the semantic and commercial equivalence threshold.", badRecommendationPrevented: false };
  }
  return { classification: "leave_as_404_or_410", reason: "No verified, sufficiently equivalent live destination exists; preserve the 404/410 response.", badRecommendationPrevented: true };
}
