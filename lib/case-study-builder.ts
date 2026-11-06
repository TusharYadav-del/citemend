export type CaseStudyActionKind = "301_redirect" | "citation_capsule" | "publisher_outreach" | "pixel_rescue" | "verified_recovery";
export type CaseStudyInput = {
  anonymize: boolean;
  estimatedPipelineValuePerVisitUsd?: number | null;
  audit: { id: string; domain: string; createdAt: string; buyerPrompt?: string | null; agencyBrandName?: string | null; agencyPrimaryColor?: string | null };
  brokenLinks: { id: string; citedUrl: string; httpStatus: number; urlState?: string | null; approvalStatus?: string | null; suggestedRedirect?: string | null }[];
  outcomes: { brokenLinkId: string | null; canonicalDestinationUrl: string; technicalDeploymentVerifiedAt: string | null; aiCitationObservedAt: string | null; evidenceId?: string | null }[];
  observations?: { id: string; provider: string; modelName: string; observedAt: string; extractedUrls: string[] }[];
  rescuedVisits?: { rescuedTargetUrl?: string | null; createdAt?: string | null }[];
  actions?: { actionType: string; targetUrl?: string | null; createdAt?: string | null }[];
};
export type CaseStudy = {
  title: string;
  anonymized: boolean;
  brandName: string;
  brandColor: string;
  workspaceLabel: string;
  buyerPrompt: string | null;
  baselineProblem: { description: string; sourceUrl: string | null; observedStatus: number | null };
  observableEvidence: string[];
  recoveryAction: { kind: CaseStudyActionKind; label: string; destinationUrl: string | null; recordedAt: string | null };
  timeToRecoveryMinutes: number | null;
  verifiedOutcome: {
    technicalDeploymentVerified: boolean;
    technicalVerifiedAt: string | null;
    laterAiCitationObserved: boolean;
    aiCitationObservedAt: string | null;
    measuredRescuedAiVisits: number;
    estimatedPipelineUsd: number | null;
    assumedPipelineValuePerVisitUsd: number | null;
    estimateDisclosure: string;
  };
  evidenceLimits: string[];
};

function cleanColor(value: string | null | undefined) { return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#37F5A0"; }
function safeDate(value: string | null | undefined): number | null { if (!value) return null; const time = Date.parse(value); return Number.isFinite(time) ? time : null; }
function displayUrl(value: string | null | undefined, anonymize: boolean): string | null {
  if (!value) return null;
  if (anonymize) return "[customer URL redacted]";
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function buildVerifiedCaseStudy(input: CaseStudyInput): CaseStudy {
  const visitRows = input.rescuedVisits ?? [];
  const outcomes = input.outcomes.map((outcome) => {
    const technicalMs = safeDate(outcome.technicalDeploymentVerifiedAt);
    const citationMs = safeDate(outcome.aiCitationObservedAt);
    const laterCitation = technicalMs !== null && citationMs !== null && citationMs >= technicalMs;
    return { ...outcome, technicalMs, citationMs, laterCitation };
  });
  const verifiedPair = outcomes.find((outcome) => outcome.technicalMs !== null && outcome.laterCitation);
  const technicalOutcome = verifiedPair ?? outcomes.find((outcome) => outcome.technicalMs !== null) ?? null;
  if (!verifiedPair && visitRows.length === 0) throw new Error("A case study requires a technical deployment plus later AI citation, or at least one measured rescued AI visit.");

  const outcome = technicalOutcome ?? outcomes[0] ?? null;
  const linkedBroken = outcome?.brokenLinkId ? input.brokenLinks.find((link) => link.id === outcome.brokenLinkId) : null;
  const broken = linkedBroken ?? input.brokenLinks.find((link) => [404, 410].includes(link.httpStatus) || link.urlState === "hallucinated") ?? null;
  const firstVisitAt = visitRows.map((visit) => visit.createdAt ?? null).filter((value): value is string => !!value && safeDate(value) !== null).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  const technicalAt = outcome?.technicalDeploymentVerifiedAt ?? null;
  const auditStartedAt = safeDate(input.audit.createdAt);
  const recoverySignalAt = safeDate(technicalAt) !== null ? technicalAt : firstVisitAt;
  const recoverySignalMs = safeDate(recoverySignalAt);
  const elapsed = auditStartedAt !== null && recoverySignalMs !== null && recoverySignalMs >= auditStartedAt ? Math.round((recoverySignalMs - auditStartedAt) / 60_000) : null;
  const measuredVisits = visitRows.length;
  const actionTypes = (input.actions ?? []).map((item) => item.actionType.toLowerCase());
  let actionKind: CaseStudyActionKind = "verified_recovery";
  if (actionTypes.some((kind) => /capsule/.test(kind))) actionKind = "citation_capsule";
  else if (actionTypes.some((kind) => /outreach|publisher/.test(kind))) actionKind = "publisher_outreach";
  else if (outcome?.technicalMs !== null && outcome?.technicalMs !== undefined || measuredVisits > 0) actionKind = measuredVisits > 0 && !outcome?.technicalMs ? "pixel_rescue" : "301_redirect";
  const labels: Record<CaseStudyActionKind, string> = {
    "301_redirect": "Verified 301 redirect",
    citation_capsule: "Citation Capsule prepared",
    publisher_outreach: "Publisher outreach recorded",
    pixel_rescue: "AI visitor rescued through the recovery path",
    verified_recovery: "Verified recovery action",
  };
  const domainLabel = input.anonymize ? "A customer workspace" : input.audit.domain;
  const brandName = input.anonymize ? "CiteMend customer" : input.audit.agencyBrandName?.trim() || input.audit.domain;
  const citationObservedAt = outcome?.laterCitation ? outcome.aiCitationObservedAt : null;
  const destinationUrl = outcome?.canonicalDestinationUrl ?? visitRows[0]?.rescuedTargetUrl ?? null;
  const observableEvidence: string[] = [];
  if (broken) observableEvidence.push(input.anonymize ? `A saved audit recorded a broken or hallucinated customer URL (HTTP ${broken.httpStatus}).` : `The saved audit recorded ${broken.citedUrl} with HTTP ${broken.httpStatus}.`);
  if (technicalAt) observableEvidence.push(`The recovery destination was technically verified at ${new Date(technicalAt).toISOString()}.`);
  if (citationObservedAt) observableEvidence.push(`A later saved AI observation cited the destination at ${new Date(citationObservedAt).toISOString()}.`);
  if (measuredVisits) observableEvidence.push(`${measuredVisits} rescued AI visit${measuredVisits === 1 ? " was" : "s were"} measured in pixel telemetry.`);
  const evidenceObservation = outcome?.evidenceId ? (input.observations ?? []).find((item) => item.id === outcome.evidenceId) : null;
  if (evidenceObservation) observableEvidence.push(`Reproducible follow-up evidence was saved from ${evidenceObservation.provider} / ${evidenceObservation.modelName} on ${new Date(evidenceObservation.observedAt).toISOString()}.`);
  if (!observableEvidence.length) observableEvidence.push("A saved recovery outcome is available; its underlying event detail was not included in this report.");
  const assumedValuePerVisit = input.estimatedPipelineValuePerVisitUsd !== undefined && input.estimatedPipelineValuePerVisitUsd !== null && Number.isFinite(input.estimatedPipelineValuePerVisitUsd) && input.estimatedPipelineValuePerVisitUsd > 0 ? input.estimatedPipelineValuePerVisitUsd : null;
  const estimatedPipeline = measuredVisits > 0 && assumedValuePerVisit !== null ? measuredVisits * assumedValuePerVisit : null;
  return {
    title: input.anonymize ? "How a customer restored an AI search recovery path" : `How ${brandName} recovered an AI search citation`,
    anonymized: input.anonymize,
    brandName,
    brandColor: input.anonymize ? "#37F5A0" : cleanColor(input.audit.agencyPrimaryColor),
    workspaceLabel: domainLabel,
    buyerPrompt: input.anonymize ? null : input.audit.buyerPrompt?.slice(0, 500) ?? null,
    baselineProblem: {
      description: broken ? (broken.urlState === "hallucinated" ? "A saved buyer-prompt audit included a hallucinated destination." : "A previously cited destination was recorded as broken.") : "A buyer-intent prompt had a missing or incomplete citation path before the verified recovery signal.",
      sourceUrl: displayUrl(broken?.citedUrl, input.anonymize),
      observedStatus: broken?.httpStatus ?? null,
    },
    observableEvidence,
    recoveryAction: { kind: actionKind, label: labels[actionKind], destinationUrl: displayUrl(destinationUrl, input.anonymize), recordedAt: technicalAt ?? firstVisitAt },
    timeToRecoveryMinutes: elapsed,
    verifiedOutcome: {
      technicalDeploymentVerified: !!outcome?.technicalMs,
      technicalVerifiedAt: technicalAt ? new Date(technicalAt).toISOString() : null,
      laterAiCitationObserved: !!citationObservedAt,
      aiCitationObservedAt: citationObservedAt ? new Date(citationObservedAt).toISOString() : null,
      measuredRescuedAiVisits: measuredVisits,
      estimatedPipelineUsd: estimatedPipeline,
      assumedPipelineValuePerVisitUsd: estimatedPipeline === null ? null : assumedValuePerVisit,
      estimateDisclosure: measuredVisits === 0 ? "No estimate: there are no measured rescued visits in this record." : estimatedPipeline === null ? `Traffic measurement: ${measuredVisits} rescued AI visits. Pipeline value is not estimated because no per-visit value assumption was configured.` : `Estimated pipeline only: ${measuredVisits} measured rescued AI visits × configured assumed $${assumedValuePerVisit} per visit. This is not revenue or realized sales.`,
    },
    evidenceLimits: [
      "Technical deployment verification, later AI citation observation, and measured rescued visits are reported as separate outcomes.",
      "A technical redirect alone does not establish that an AI system later cited the destination.",
      "Estimated pipeline is a planning estimate only and is never reported as realized revenue.",
      ...(input.anonymize ? ["Customer domain, exact URLs, and buyer prompt were removed from this anonymized version."] : []),
    ],
  };
}
