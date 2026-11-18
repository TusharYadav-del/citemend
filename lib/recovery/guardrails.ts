import { normalizeRecoveryUrl } from "./normalize";

export type GuardrailClassification = "recoverable_equivalent" | "leave_as_404_or_410" | "chain_or_loop_risk";
export type RecoveryGuardrailResult = { classification: GuardrailClassification; confidence_score: number | null; match_reason: string; rejected_soft_404: boolean; blocked_loop: boolean };

export function hasCommercialTopicEquivalence(sourceUrl: string, targetUrl: string): boolean {
  try {
    const source = normalizeRecoveryUrl(sourceUrl).normalized_path;
    const target = normalizeRecoveryUrl(targetUrl).normalized_path;
    const kinds = ["products", "collections", "pricing", "policies"];
    const sourceKind = kinds.find(kind => source.split("/").includes(kind));
    const targetKind = kinds.find(kind => target.split("/").includes(kind));
    if (sourceKind || targetKind) return sourceKind !== undefined && sourceKind === targetKind;
    const ignored = new Set(["the", "and", "for", "with", "from", "old", "new", "page", "index"]);
    const words = (path: string) => new Set(path.split(/[^a-z0-9]+/).filter(word => word.length > 2 && !ignored.has(word)));
    const left = words(source), right = words(target);
    const overlap = [...left].filter(word => right.has(word)).length;
    return overlap >= 1 && overlap / Math.max(left.size, right.size, 1) >= 0.5;
  } catch { return false; }
}

export function evaluateRecoveryCandidate(input: {
  deadUrl: string;
  suggestedTargetUrl: string | null;
  sourceStatus: number;
  targetStatus: number | null;
  confidenceScore: number | null;
  semanticEquivalent: boolean;
  commerciallyEquivalent: boolean;
  redirectHops?: number;
  knownRedirectUrls?: string[];
  confidenceThreshold?: number;
}): RecoveryGuardrailResult {
  const threshold = input.confidenceThreshold ?? 65;
  const risk = (reason: string, blockedLoop: boolean): RecoveryGuardrailResult => ({ classification: "chain_or_loop_risk", confidence_score: input.confidenceScore, match_reason: reason, rejected_soft_404: false, blocked_loop: blockedLoop });
  let source: ReturnType<typeof normalizeRecoveryUrl>;
  try { source = normalizeRecoveryUrl(input.deadUrl); } catch { return risk("The source URL is invalid.", false); }
  if (!input.suggestedTargetUrl) return { classification: "leave_as_404_or_410", confidence_score: input.confidenceScore, match_reason: input.confidenceScore !== null && input.confidenceScore < threshold ? "manual_mapping_required: candidate similarity is below the recovery confidence floor; preserve the source 404/410." : "No verified destination candidate is available; preserve the source 404/410.", rejected_soft_404: input.confidenceScore !== null && input.confidenceScore < threshold, blocked_loop: false };
  let target: ReturnType<typeof normalizeRecoveryUrl>;
  try { target = normalizeRecoveryUrl(input.suggestedTargetUrl); } catch { return risk("The suggested destination URL is invalid.", false); }
  if (target.normalized_path === source.normalized_path && new URL(input.suggestedTargetUrl).origin.toLowerCase() === new URL(input.deadUrl).origin.toLowerCase()) return risk("The destination matches the source path and would create a self-loop.", true);
  const known = new Set((input.knownRedirectUrls ?? []).map(url => { try { return normalizeRecoveryUrl(url).normalized_url; } catch { return ""; } }));
  if (known.has(target.normalized_url) || (input.redirectHops ?? 0) > 0) return risk("The destination is already redirecting or would create a redirect chain.", false);
  if (input.targetStatus !== 200) return risk(`The destination returned HTTP ${input.targetStatus ?? "unknown"}; only a direct HTTP 200 is eligible.`, false);
  const deepSource = source.normalized_path.split("/").filter(Boolean).length > 1;
  if (target.normalized_path === "/" && deepSource) return { classification: "leave_as_404_or_410", confidence_score: input.confidenceScore, match_reason: "A deep URL mapped to the homepage would be a soft 404; preserve the source 404/410.", rejected_soft_404: true, blocked_loop: false };
  if ((input.sourceStatus !== 404 && input.sourceStatus !== 410) || input.confidenceScore === null || input.confidenceScore < threshold || input.confidenceScore > 100 || !input.semanticEquivalent || !input.commerciallyEquivalent) return { classification: "leave_as_404_or_410", confidence_score: input.confidenceScore, match_reason: "The live candidate does not meet the semantic and commercial equivalence threshold; preserve the source 404/410.", rejected_soft_404: true, blocked_loop: false };
  return { classification: "recoverable_equivalent", confidence_score: input.confidenceScore, match_reason: "The destination is a direct HTTP 200 with verified semantic and commercial equivalence; human approval is still required.", rejected_soft_404: false, blocked_loop: false };
}
