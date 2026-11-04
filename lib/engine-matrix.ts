export const ENGINE_PROFILES = [
  "ChatGPT Search",
  "Perplexity Sonar",
  "Google Gemini",
  "Claude",
] as const;

export type EngineName = typeof ENGINE_PROFILES[number];
export type EngineStatus = "cited_rank_1" | "cited_rank_2_plus" | "cited_dead_404_slug" | "cited_reddit_thread" | "omitted_competitor_won" | "cited_unverified" | "omitted_no_competitor" | "not_evaluated";
export type EngineCitation = { url: string; httpStatus?: number | null; title?: string };
export type EnginePromptInput = { prompt: string; citations: EngineCitation[]; responseText?: string; available?: boolean; profiles?: Partial<Record<EngineName, { citations: EngineCitation[]; available: boolean; provider: string }>> };
export type EngineMatrixRow = {
  prompt: string;
  engine: EngineName;
  status: EngineStatus;
  citedUrl: string | null;
  competitor: string | null;
  evidenceSource: "shared_grounding";
  evidenceVersion?: 2 | 3;
  provider?: string;
  competitorsCited?: string[];
};

export function hasVerifiedMatrix(value: unknown): boolean {
  const scoredStatuses: EngineStatus[] = ["cited_rank_1", "cited_rank_2_plus", "cited_dead_404_slug", "cited_reddit_thread", "omitted_competitor_won", "omitted_no_competitor"];
  return Array.isArray(value) && value.length > 0 && value.every(row => row && typeof row === "object" && row.evidenceVersion === 3 && scoredStatuses.includes(row.status));
}

export function describeEngineStatus(row: EngineMatrixRow): string {
  if (row.evidenceVersion !== 3) return "⚠️ Legacy result; rerun audit";
  switch (row.status) {
    case "cited_rank_1": return "✅ Cited #1";
    case "cited_rank_2_plus": return "✅ Cited #2+";
    case "cited_dead_404_slug": return "⚠️ Dead 404 slug";
    case "cited_reddit_thread": return "❌ Cited Reddit thread";
    case "cited_unverified": return "⚠️ Citation not verified live";
    case "not_evaluated": return "⚠️ Probe unavailable";
    case "omitted_no_competitor": return "❌ Omitted; no competitor confirmed";
    default: return `❌ Omitted (Cited ${row.competitor ?? "Competitor"})`;
  }
}

/** Compare modeled citation appearances; competitor URL availability is not checked here. */
export function compareCategoryCitationRanks(value: unknown): { rank: number; participants: number; ownSlots: number; topCompetitor: string; topCompetitorSlots: number; totalSlots: number } | null {
  if (!hasVerifiedMatrix(value) || !Array.isArray(value)) return null;
  const rows = value as EngineMatrixRow[];
  if (!rows.every(row => Array.isArray(row.competitorsCited) && row.competitorsCited.every(item => typeof item === "string"))) return null;
  const totals = new Map<string, number>();
  for (const row of rows) for (const domain of new Set(row.competitorsCited)) totals.set(domain, (totals.get(domain) ?? 0) + 1);
  if (!totals.size) return null;
  const ownSlots = rows.filter(row => row.status === "cited_rank_1" || row.status === "cited_rank_2_plus").length;
  const ranked = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { rank: 1 + ranked.filter(([, count]) => count > ownSlots).length, participants: ranked.length + 1, ownSlots, topCompetitor: ranked[0][0], topCompetitorSlots: ranked[0][1], totalSlots: rows.length };
}

function hostMatches(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const target = domain.toLowerCase().replace(/^www\./, "");
    return host === target || host.endsWith(`.${target}`);
  } catch { return false; }
}

function isReddit(url: string): boolean {
  try { return /(^|\.)reddit\.com$/i.test(new URL(url).hostname); } catch { return false; }
}

function citationStatus(citation: EngineCitation, isFirst: boolean): EngineStatus {
  if (isReddit(citation.url)) return "cited_reddit_thread";
  if (citation.httpStatus === 404 || citation.httpStatus === 410) return "cited_dead_404_slug";
  return isFirst ? "cited_rank_1" : "cited_rank_2_plus";
}

/**
 * Classifies per-profile synthesis results grounded in the same search evidence.
 * These are modeled profiles rather than observations from native engine APIs.
 */
export function buildEngineMatrix(input: {
  domain: string;
  prompts: EnginePromptInput[];
  competitorDomains?: string[];
}): { rows: EngineMatrixRow[]; shareOfModelScore: number | null; citedSlots: number; totalSlots: number } {
  const competitors = (input.competitorDomains ?? []).map(domain => domain.toLowerCase().replace(/^www\./, ""));
  const rows: EngineMatrixRow[] = [];
  let citedSlots = 0;
  const totalSlots = input.prompts.length * ENGINE_PROFILES.length;

  for (const prompt of input.prompts) {
    for (const engine of ENGINE_PROFILES) {
      const profile = prompt.profiles?.[engine];
      const citations = prompt.profiles ? profile?.citations ?? [] : prompt.citations;
      const provider = profile?.provider;
      const competitorsCited = competitors.filter(domain => citations.some(citation => hostMatches(citation.url, domain)));
      const ownLive = citations.findIndex(citation => hostMatches(citation.url, input.domain) && typeof citation.httpStatus === "number" && citation.httpStatus >= 200 && citation.httpStatus < 300);
      if (prompt.available === false || prompt.profiles && !profile?.available) {
        rows.push({ prompt: prompt.prompt, engine, status: "not_evaluated", citedUrl: null, competitor: null, evidenceSource: "shared_grounding", provider, competitorsCited });
        continue;
      }
      if (ownLive >= 0) {
        const citation = citations[ownLive];
        rows.push({ prompt: prompt.prompt, engine, status: citationStatus(citation, ownLive === 0), citedUrl: citation.url, competitor: null, evidenceSource: "shared_grounding", provider, competitorsCited });
        citedSlots++;
        continue;
      }
      const uncheckedOwn = citations.find(citation => hostMatches(citation.url, input.domain) && ![404, 410].includes(citation.httpStatus ?? 0));
      if (uncheckedOwn) {
        rows.push({ prompt: prompt.prompt, engine, status: "cited_unverified", citedUrl: uncheckedOwn.url, competitor: null, evidenceSource: "shared_grounding", provider, competitorsCited });
        continue;
      }
      const deadOwn = citations.find(citation => hostMatches(citation.url, input.domain) && [404, 410].includes(citation.httpStatus ?? 0));
      if (deadOwn) {
        rows.push({ prompt: prompt.prompt, engine, status: "cited_dead_404_slug", citedUrl: deadOwn.url, competitor: null, evidenceSource: "shared_grounding", provider, competitorsCited });
        continue;
      }
      const winner = citations.find(citation => competitors.find(domain => hostMatches(citation.url, domain)) || isReddit(citation.url));
      if (winner && isReddit(winner.url)) {
        rows.push({ prompt: prompt.prompt, engine, status: "cited_reddit_thread", citedUrl: winner.url, competitor: null, evidenceSource: "shared_grounding", provider, competitorsCited });
        continue;
      }
      const competitor = winner ? competitors.find(domain => hostMatches(winner.url, domain)) ?? null : null;
      rows.push({ prompt: prompt.prompt, engine, status: competitor ? "omitted_competitor_won" : "omitted_no_competitor", citedUrl: winner?.url ?? null, competitor, evidenceSource: "shared_grounding", provider, competitorsCited });
    }
  }
  const incomplete = rows.some(row => row.status === "cited_unverified" || row.status === "not_evaluated");
  const separateProfiles = input.prompts.length > 0 && input.prompts.every(prompt => !!prompt.profiles);
  return { rows: rows.map(row => ({ ...row, evidenceVersion: separateProfiles ? 3 as const : 2 as const })), citedSlots, totalSlots, shareOfModelScore: totalSlots && !incomplete ? Math.round(citedSlots * 100 / totalSlots) : null };
}
