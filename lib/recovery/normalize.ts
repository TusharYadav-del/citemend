export type RecoverySignalInput = {
  url: string;
  kind?: "dead_url" | "citation";
  observed404Visits?: number;
  externalReferrers?: number;
  citationSnapshots?: number;
  userAgentVerified?: boolean;
};

export type NormalizedRecoveryGroup = {
  normalized_path: string;
  variants: string[];
  observed_404_visits: number;
  external_referrers: number;
  citation_snapshots: number;
  user_agent_verified: boolean;
  priority_score: number;
};

const TRACKING = /^(utm_.+|fbclid|gclid|ref|_ga|mc_cid)$/i;
const HIGH_INTENT = /\/(products|collections|pricing|policies)(\/|$)/i;

export function normalizeRecoveryUrl(value: string): { normalized_path: string; normalized_url: string } {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new TypeError("Recovery URL must be a credential-free HTTP(S) URL.");
  const path = (url.pathname.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/");
  const query = [...url.searchParams.entries()].filter(([key]) => !TRACKING.test(key)).sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  const normalized = new URL(url.origin.toLowerCase());
  normalized.pathname = path;
  for (const [key, item] of query) normalized.searchParams.append(key, item);
  return { normalized_path: path, normalized_url: normalized.href };
}

export function groupRecoverySignals(inputs: RecoverySignalInput[]): NormalizedRecoveryGroup[] {
  const groups = new Map<string, NormalizedRecoveryGroup>();
  for (const input of inputs) {
    const key = normalizeRecoveryUrl(input.url).normalized_path;
    let group = groups.get(key);
    if (!group) {
      group = { normalized_path: key, variants: [], observed_404_visits: 0, external_referrers: 0, citation_snapshots: 0, user_agent_verified: false, priority_score: 0 };
      groups.set(key, group);
    }
    if (!group.variants.includes(input.url)) group.variants.push(input.url);
    group.observed_404_visits += Math.max(0, input.observed404Visits ?? 0);
    group.external_referrers += Math.max(0, input.externalReferrers ?? 0);
    group.citation_snapshots += Math.max(0, input.citationSnapshots ?? (input.kind === "citation" ? 1 : 0));
    group.user_agent_verified ||= input.userAgentVerified === true;
  }
  return [...groups.values()].map(group => {
    const visitSignal = Math.min(35, 10 * Math.log2(group.observed_404_visits + 1));
    const referrerSignal = Math.min(20, group.external_referrers ? 20 : 0);
    const citationSignal = Math.min(25, 8 * Math.log2(group.citation_snapshots + 1));
    const intentSignal = HIGH_INTENT.test(group.normalized_path) ? 20 : 0;
    group.priority_score = Math.round(Math.min(100, visitSignal + referrerSignal + citationSignal + intentSignal));
    return group;
  });
}
