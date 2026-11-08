import "server-only";
import type { DiscoveryResult, CitationEvidence } from "./types";
import { verifyUrl } from "../seo";
import { extractTextUrls } from "../citation-urls";
import { runCitationProbe, type CitationProbeResult } from "../citation-probe";

/** Runs the existing grounded Groq/Tavily probe, then verifies only URLs in its generated answer. */
export async function researchCompany(item: DiscoveryResult, dependencies: { verify?: typeof verifyUrl; probe?: typeof runCitationProbe } = {}) {
  let answer: CitationProbeResult | null = null;
  try { answer = await (dependencies.probe ?? runCitationProbe)(item.domain, `Research ${item.companyName}, a ${item.category} company. What pages and facts about this company are useful to someone researching its services? Include source URLs and distinguish search-backed facts from estimates.`); }
  catch { /* Search results remain stored, but no provider citation is claimed when the probe is unavailable. */ }
  const cited = [...new Set(answer ? extractTextUrls(answer.text) : [])].slice(0, 8);
  const verify = dependencies.verify ?? verifyUrl;
  const citationEvidence = await Promise.all(cited.map(async url => {
    const check = await verify(url);
    const result: CitationEvidence = { url, state: check.state, httpStatus: check.httpStatus, ...(check.finalUrl ? { finalUrl: check.finalUrl } : {}), sourceUrl: item.sourceUrl, excerpt: (answer?.text ?? "").slice(0, 1600) };
    return result;
  }));
  return { ...item, citationEvidence, answerText: answer?.text.slice(0, 4000) ?? null, answerProvider: answer?.providerUsed ?? null, answerSources: answer?.searchGrounding.sources ?? [], answerWarnings: answer?.warnings ?? ["Grounded citation probe unavailable; no AI answer citation was recorded."], researchedAt: new Date().toISOString(), evidenceSource: item.sourceUrl };
}
