export type ProvenanceObservation = { prompt_query: string; provider: string; model_name: string; retrieved_urls_json?: unknown; rendered_urls_json?: unknown; extracted_urls_json?: unknown; raw_answer?: string; observed_at: string; sample_size?: number };
export type ProvenanceEvent = { event_type: string; crawler_name: string | null; crawler_verified: boolean; referral_host: string | null; journey_hash?: string | null; occurred_at: string };

function cleanSet(value: unknown): Set<string> { return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && /^https?:\/\//i.test(item)).map(item => { try { const url = new URL(item); url.hash = ""; return url.href; } catch { return ""; } }).filter(Boolean) : []); }
function wilson(successes: number, total: number) {
  if (!total) return { low: 0, high: 0 };
  const z = 1.96, p = successes / total, denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

export function buildRetrievalConsistency(observations: ProvenanceObservation[], workspaceDomain: string) {
  const groups = new Map<string, ProvenanceObservation[]>();
  for (const item of observations.filter(row => row.prompt_query && row.provider && row.model_name)) {
    const key = `${item.prompt_query.trim().toLowerCase()}\u0000${item.provider}\u0000${item.model_name}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const tuples = [...groups.values()].map(rows => {
    const urls = new Set(rows.flatMap(row => [...cleanSet(row.retrieved_urls_json), ...cleanSet(row.rendered_urls_json), ...cleanSet(row.extracted_urls_json)]));
    const runs = rows.length;
    const urlStats = [...urls].map(url => {
      const retrieved = rows.filter(row => cleanSet(row.retrieved_urls_json).has(url)).length;
      const rendered = rows.filter(row => cleanSet(row.rendered_urls_json).has(url)).length;
      const legacyOnly = retrieved === 0 && rendered === 0 && rows.some(row => cleanSet(row.extracted_urls_json).has(url));
      const interval = wilson(retrieved, runs);
      let host = "";
      try { host = new URL(url).hostname.toLowerCase(); } catch { /* cleanSet already filtered malformed URLs. */ }
      const root = workspaceDomain.toLowerCase().replace(/^www\./, "");
      const ownedDomain = host === root || host.endsWith(`.${root}`);
      const brandToken = root.split(".")[0].replace(/[^a-z0-9]/g, "");
      const brandMentioned = !ownedDomain && !!brandToken && rows.some(row => typeof row.raw_answer === "string" && row.raw_answer.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").includes(brandToken));
      return {
        url,
        retrievedRuns: retrieved,
        renderedRuns: rendered,
        legacyOnly,
        retrievalRate: retrieved / runs,
        retrievalConfidence95: { low: interval.low, high: interval.high },
        renderedRate: rendered / runs,
        provenance: retrieved && rendered ? "retrieved_and_rendered" : retrieved ? "retrieved_only" : rendered ? "rendered_only" : "legacy_unclassified",
        citationAuthority: ownedDomain,
        thirdPartySource: !ownedDomain,
        domainInfluence: brandMentioned,
      };
    }).sort((a, b) => b.retrievalRate - a.retrievalRate || a.url.localeCompare(b.url));
    const retrievalSets = rows.map(row => cleanSet(row.retrieved_urls_json));
    const pairScores: number[] = [];
    for (let left = 0; left < retrievalSets.length; left++) for (let right = left + 1; right < retrievalSets.length; right++) {
      const a = retrievalSets[left], b = retrievalSets[right];
      const intersection = [...a].filter(url => b.has(url)).length;
      const union = new Set([...a, ...b]).size;
      pairScores.push(union ? intersection / union : 1);
    }
    const consistencyIndex = pairScores.length ? Math.round(pairScores.reduce((sum, score) => sum + score, 0) / pairScores.length * 1000) / 10 : null;
    return { promptQuery: rows[0].prompt_query, provider: rows[0].provider, model: rows[0].model_name, runs, consistencyIndex, lowSampleWarning: runs < 5, urls: urlStats };
  }).sort((a, b) => a.promptQuery.localeCompare(b.promptQuery) || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
  return { tuples, limits: ["Consistency is mean pairwise Jaccard overlap of retrieved URL sets, grouped by exact normalized prompt, provider, and model.", "95% Wilson intervals describe URL occurrence across saved runs; fewer than five runs are flagged as low sample.", "Domain influence mentions are a potential signal when a third-party URL is present and the answer mentions the workspace name; the source page itself is not independently checked for the mention.", "Legacy observations without separate retrieved/rendered fields are labeled unclassified rather than inferred from user-agent or answer text."] };
}

export function summarizeProvenanceEvents(events: ProvenanceEvent[]) {
  const verifiedCrawlerFetches = events.filter(event => event.event_type === "crawler_fetch" && event.crawler_verified).length;
  const claimedCrawlerFetches = events.filter(event => event.event_type === "crawler_fetch").length;
  const aiReferrals = events.filter(event => event.event_type === "ai_referral").length;
  const orders = events.filter(event => event.event_type === "shopify_order").length;
  const referralJourneys = new Set(events.filter(event => event.event_type === "ai_referral" && event.journey_hash).map(event => event.journey_hash));
  const matchedOrderJourneys = new Set(events.filter(event => event.event_type === "shopify_order" && event.journey_hash && referralJourneys.has(event.journey_hash)).map(event => event.journey_hash));
  return { claimedCrawlerFetches, verifiedCrawlerFetches, aiReferrals, shopifyOrders: orders, matchedReferralOrderJourneys: matchedOrderJourneys.size, verifiedCrawlerShare: claimedCrawlerFetches ? verifiedCrawlerFetches / claimedCrawlerFetches : null };
}
