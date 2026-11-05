export type RecoverySnapshot = { observedAt: string; brokenUrl?: string | null; citedUrls: string[]; claims?: string[]; urlState?: string | null; canonicalUrl?: string | null };
export function buildBeforeAfterReport(before: RecoverySnapshot, after: RecoverySnapshot) {
  const baseline = new Set(before.citedUrls); const current = new Set(after.citedUrls);
  const addedCitations = [...current].filter(url => !baseline.has(url));
  const removedCitations = [...baseline].filter(url => !current.has(url));
  const beforeClaims = new Set(before.claims ?? []); const afterClaims = new Set(after.claims ?? []);
  return { baseline: { ...before }, after: { ...after }, addedCitations, removedCitations,
    canonicalDestinationObserved: !!after.canonicalUrl && current.has(after.canonicalUrl),
    technicalStateChanged: (before.urlState ?? "unknown") !== (after.urlState ?? "unknown"),
    claimsAdded: [...afterClaims].filter(claim => !beforeClaims.has(claim)), claimsRemoved: [...beforeClaims].filter(claim => !afterClaims.has(claim)),
    elapsedMs: Math.max(0, Date.parse(after.observedAt) - Date.parse(before.observedAt)) };
}
