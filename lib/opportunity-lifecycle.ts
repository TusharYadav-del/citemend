export const OPPORTUNITY_STAGES = ["discovered", "reviewed", "contacted", "replied", "link_updated", "ai_citation_observed"] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export type OpportunitySignals = { relevance_score: number; buyer_intent_score: number; citation_evidence_score: number; replacement_quality_score: number };
export type OpportunityEvidence = { opportunity_type: string; prompt_query: string; http_status?: number | null; similarity_score?: number | null; matched_user_live_url?: string | null };
export type OpportunityStageEvent = { stage: OpportunityStage; at: string; actor_user_id: string; note: string };

export function isOpportunityStage(value: unknown): value is OpportunityStage {
  return typeof value === "string" && (OPPORTUNITY_STAGES as readonly string[]).includes(value);
}

/** Equal weighting keeps the four 0–100 ranking signals understandable and auditable. */
export function compositePriorityScore(signals: OpportunitySignals): number {
  const values = [signals.relevance_score, signals.buyer_intent_score, signals.citation_evidence_score, signals.replacement_quality_score];
  if (values.some(value => !Number.isInteger(value) || value < 0 || value > 100)) throw new RangeError("Opportunity ranking signals must be integers from 0 to 100.");
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function rankOpportunityEvidence(evidence: OpportunityEvidence): OpportunitySignals & { composite_priority_score: number } {
  const query = evidence.prompt_query.toLowerCase();
  const buyerIntent = /best|alternative|compare|pricing|price|buy|purchase|tool|software|service|recommend/.test(query) ? 85 : 55;
  const relevance = evidence.opportunity_type === "competitor_direct_404" || evidence.opportunity_type === "listicle_outbound_404" ? 80 : 65;
  const deadCitation = evidence.http_status === 404 || evidence.http_status === 410;
  const citationEvidence = deadCitation ? 95 : evidence.opportunity_type === "reddit_citation_thread" ? 75 : 65;
  const replacement = evidence.matched_user_live_url
    ? Math.round(Math.max(65, Math.min(100, 60 + (evidence.similarity_score ?? 0.375) * 40)))
    : 20;
  const signals = { relevance_score: relevance, buyer_intent_score: buyerIntent, citation_evidence_score: citationEvidence, replacement_quality_score: replacement };
  return { ...signals, composite_priority_score: compositePriorityScore(signals) };
}

export function advanceOpportunityStage(current: unknown, requested: unknown): requested is OpportunityStage {
  if (!isOpportunityStage(current) || !isOpportunityStage(requested)) return false;
  return OPPORTUNITY_STAGES.indexOf(requested) === OPPORTUNITY_STAGES.indexOf(current) + 1;
}

export function appendStageEvent(history: unknown, event: OpportunityStageEvent): OpportunityStageEvent[] {
  if (!Array.isArray(history) || history.length > 200) throw new TypeError("Opportunity stage history is invalid.");
  return [...history, event];
}
