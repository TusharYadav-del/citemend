export type DecayObservation = { urls: string[]; raw_answer?: string; observed_at: string; sample_size?: number };
export type ConfidenceInterval = { confidence_interval_low: number; confidence_interval_high: number; sample_size: number; sample_size_warning: string | null };

/** Wilson score interval for a binomial proportion, expressed as percentages. */
export function wilsonConfidenceInterval(successes: number, sampleSize: number, z = 1.96): ConfidenceInterval {
  const n = Math.max(0, Math.floor(sampleSize));
  if (n === 0) return { confidence_interval_low: 0, confidence_interval_high: 100, sample_size: 0, sample_size_warning: "Low sample-size warning: n < 5 observations; treat this estimate as highly uncertain." };
  const x = Math.max(0, Math.min(n, Math.floor(successes)));
  const p = x / n, z2 = z * z, denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n) / denominator;
  return { confidence_interval_low: Math.max(0, (center - margin) * 100), confidence_interval_high: Math.min(100, (center + margin) * 100), sample_size: n, sample_size_warning: n < 5 ? "Low sample-size warning: n < 5 observations; treat this estimate as highly uncertain." : null };
}

function extractDates(rawAnswer = ""): number[] {
  const dates = new Set<number>();
  const patterns = [
    /(?:dateModified|datePublished|last[-_ ]modified)\s*["']?\s*[:=]\s*["']?(\d{4}-\d{2}-\d{2}(?:T[\d:.+-Z]+)?)/gi,
    /(?:dateModified|datePublished|last[-_ ]modified)[^\n]{0,20}?((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT)/gi,
  ];
  for (const pattern of patterns) for (const match of rawAnswer.matchAll(pattern)) { const time = Date.parse(match[1]); if (Number.isFinite(time)) dates.add(time); }
  return [...dates];
}

export function predictCitationDecay(input: { url: string; observations: DecayObservation[]; now?: number; staleAfterDays?: number }) {
  const observations = [...input.observations].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  const weights = observations.map((item) => Math.max(1, Math.floor(item.sample_size ?? 1)));
  const n = weights.reduce((sum, value) => sum + value, 0);
  const cited = observations.map((item) => item.urls.includes(input.url));
  const successes = cited.reduce((sum, present, index) => sum + (present ? weights[index] : 0), 0);
  const interval = wilsonConfidenceInterval(successes, n);
  // Compare equally sized historical halves by weighted observation count.
  const weightedRate = (part: boolean[], offset: number) => {
    let total = 0, hits = 0;
    part.forEach((present, index) => { const weight = weights[offset + index]; total += weight; if (present) hits += weight; });
    return total ? hits / total : 0;
  };
  const half = Math.ceil(observations.length / 2);
  const earlyRate = weightedRate(cited.slice(0, half), 0);
  const recentRate = weightedRate(cited.slice(half), half);
  const decline = Math.max(0, earlyRate - recentRate);
  const now = input.now ?? Date.now(), staleMs = (input.staleAfterDays ?? 180) * 86400000;
  const ownDates = observations.filter((item) => item.urls.includes(input.url)).flatMap((item) => extractDates(item.raw_answer));
  const competitorDates = observations.filter((item) => !item.urls.includes(input.url)).flatMap((item) => extractDates(item.raw_answer));
  const latestOwn = ownDates.length ? Math.max(...ownDates) : null;
  const latestCompetitor = competitorDates.length ? Math.max(...competitorDates) : null;
  const stale = latestOwn !== null && now - latestOwn > staleMs;
  const competitorsFresher = stale && latestCompetitor !== null && latestCompetitor > latestOwn;
  const earlyCompetitors = new Set(observations.slice(0, half).flatMap((item) => item.urls).filter((url) => url !== input.url));
  const recentCompetitors = new Set(observations.slice(half).flatMap((item) => item.urls).filter((url) => url !== input.url));
  const increasingCompetitorVelocity = recentCompetitors.size > earlyCompetitors.size;
  const velocity = Math.min(1, Math.max(0, recentCompetitors.size - earlyCompetitors.size) / Math.max(1, observations.length));
  const risk = Math.round(100 * Math.min(1, decline * 0.55 + (stale ? 0.2 : 0) + (competitorsFresher ? 0.15 : 0) + velocity * 0.1));
  return { url: input.url, decay_risk_score: risk, citation_rate: n ? successes / n * 100 : 0, ...interval, signals: { declining_citation_frequency: decline > 0, content_stale_over_180_days: stale, competitors_publish_fresher_pages: competitorsFresher, increasing_competitor_source_velocity: increasingCompetitorVelocity, competitor_source_velocity: recentCompetitors.size, freshness_dates_observed: ownDates.length + competitorDates.length } };
}

/** Return only an anonymous aggregate after at least five distinct opted-in workspaces contribute. */
export function buildOptInBenchmark(rows: { workspaceKey: string; cited: number; total: number; category?: string }[], category = "other") {
  const eligible = rows.filter((row) => row.total > 0 && (row.category ?? "other") === category);
  const distinct = new Set(eligible.map((row) => row.workspaceKey));
  if (distinct.size < 5) return null;
  const total = eligible.reduce((sum, row) => sum + row.total, 0), cited = eligible.reduce((sum, row) => sum + row.cited, 0);
  return { category, contributing_workspaces: distinct.size, citation_rate: total ? cited / total * 100 : 0, sample_size: total };
}
