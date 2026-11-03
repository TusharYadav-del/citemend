export const ENGINE_PROFILES = [
  "ChatGPT Search",
  "Perplexity Sonar",
  "Google Gemini",
  "Claude",
] as const;

export type EngineName = typeof ENGINE_PROFILES[number];
export type EngineStatus = "cited_rank_1" | "cited_rank_2_plus" | "cited_dead_404_slug" | "cited_reddit_thread" | "omitted_competitor_won";
export type EngineCitation = { url: string; httpStatus?: number | null; title?: string };
export type EnginePromptInput = { prompt: string; citations: EngineCitation[]; responseText?: string };
export type EngineMatrixRow = {
  prompt: string;
  engine: EngineName;
  status: EngineStatus;
  citedUrl: string | null;
  competitor: string | null;
  evidenceSource: "shared_grounding";
};

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
 * Builds four comparable synthesis profiles from the same live grounded evidence.
 * These are modeled profiles rather than independent observations from paid engine APIs.
 */
export function buildEngineMatrix(input: {
  domain: string;
  prompts: EnginePromptInput[];
  competitorDomains?: string[];
}): { rows: EngineMatrixRow[]; shareOfModelScore: number; citedSlots: number; totalSlots: number } {
  const competitors = (input.competitorDomains ?? []).map(domain => domain.toLowerCase().replace(/^www\./, ""));
  const rows: EngineMatrixRow[] = [];
  let citedSlots = 0;
  const totalSlots = input.prompts.length * ENGINE_PROFILES.length;

  for (const prompt of input.prompts) {
    const citations = prompt.citations;
    const ownLive = citations.findIndex(citation => hostMatches(citation.url, input.domain) && citation.httpStatus !== 404 && citation.httpStatus !== 410);
    for (const engine of ENGINE_PROFILES) {
      if (ownLive >= 0) {
        const citation = citations[ownLive];
        rows.push({ prompt: prompt.prompt, engine, status: citationStatus(citation, ownLive === 0), citedUrl: citation.url, competitor: null, evidenceSource: "shared_grounding" });
        citedSlots++;
        continue;
      }
      const deadOwn = citations.find(citation => hostMatches(citation.url, input.domain) && [404, 410].includes(citation.httpStatus ?? 0));
      if (deadOwn) {
        rows.push({ prompt: prompt.prompt, engine, status: "cited_dead_404_slug", citedUrl: deadOwn.url, competitor: null, evidenceSource: "shared_grounding" });
        continue;
      }
      const winner = citations.find(citation => competitors.find(domain => hostMatches(citation.url, domain)) || isReddit(citation.url));
      const competitor = winner ? (competitors.find(domain => hostMatches(winner.url, domain)) ?? new URL(winner.url).hostname) : (citations[0] ? new URL(citations[0].url).hostname : "Search sources");
      rows.push({ prompt: prompt.prompt, engine, status: "omitted_competitor_won", citedUrl: winner?.url ?? citations[0]?.url ?? null, competitor, evidenceSource: "shared_grounding" });
    }
  }
  return { rows, citedSlots, totalSlots, shareOfModelScore: totalSlots ? Math.round(citedSlots * 100 / totalSlots) : 0 };
}
