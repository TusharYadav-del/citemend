export type OutcomeMilestones = { technical_deployment_verified: boolean; ai_citation_observed: boolean; technical_verified_at: string | null; ai_citation_observed_at: string | null };

export function assessTechnicalDeployment(input: { approved: boolean; source404: boolean; destinationStatus: number | null; sameDomain: boolean; noLoop: boolean; noConflict: boolean }): boolean {
  return input.approved && input.source404 && input.destinationStatus === 200 && input.sameDomain && input.noLoop && input.noConflict;
}

export function observationCitesCanonical(input: { technicalVerified: boolean; observationAt: string; technicalVerifiedAt: string; extractedUrls: string[]; canonicalUrl: string }): boolean {
  if (!input.technicalVerified || Date.parse(input.observationAt) <= Date.parse(input.technicalVerifiedAt)) return false;
  const normalize = (value: string) => { try { const url = new URL(value); url.hash = ""; if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, ""); return url.href; } catch { return null; } };
  const canonical = normalize(input.canonicalUrl);
  return !!canonical && input.extractedUrls.some(value => normalize(value) === canonical);
}

export function outcomeMilestones(input: { technicalVerifiedAt?: string | null; aiCitationObservedAt?: string | null }): OutcomeMilestones {
  return { technical_deployment_verified: !!input.technicalVerifiedAt, ai_citation_observed: !!input.aiCitationObservedAt,
    technical_verified_at: input.technicalVerifiedAt ?? null, ai_citation_observed_at: input.aiCitationObservedAt ?? null };
}
