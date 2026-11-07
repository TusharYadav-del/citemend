export const EVIDENCE_CATEGORY_LABELS = {
  http: "Verified HTTP & Destination Check",
  observation: "Recorded Platform / Provider Observation",
  estimate: "Heuristic / Simulation Estimate",
} as const;

export type EvidenceCategory = keyof typeof EVIDENCE_CATEGORY_LABELS;

export function classifyEvidenceCategory(input: { httpStatus?: number | null; provider?: string | null; model?: string | null; observedAt?: string | null; simulated?: boolean }): EvidenceCategory {
  if (input.simulated) return "estimate";
  if (typeof input.httpStatus === "number" && Number.isInteger(input.httpStatus)) return "http";
  if (input.provider?.trim() && input.model?.trim() && input.observedAt && Number.isFinite(Date.parse(input.observedAt))) return "observation";
  return "estimate";
}
