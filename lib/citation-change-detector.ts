export type CitationObservation = {
  id: string;
  audit_id?: string;
  prompt_query: string;
  model_name: string;
  domain: string;
  extracted_urls_json: unknown;
  observed_at: string;
  url_status_json?: unknown;
};

export type CitationChange = {
  previous_observation_id: string;
  current_observation_id: string;
  prompt_query: string;
  event_type: "citation_gained" | "citation_lost" | "source_replaced" | "url_broke";
  source_url: string;
  replacement_url: string | null;
  new_replacement_url: string | null;
  replaced_by_competitor: boolean;
  evidence_json: Record<string, unknown>;
};

const urls = (value: unknown) => new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && /^https?:\/\//i.test(item)) : []);
function statusMap(value: unknown): Record<string, number | string> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, number | string> : {};
}

/** Compare consecutive observations for the same prompt/model, with explicit evidence for URL status transitions. */
export function detectCitationChanges(observations: CitationObservation[]): CitationChange[] {
  const ordered = [...observations].filter((item) => item.id && item.prompt_query && item.model_name).sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  const byTuple = new Map<string, CitationObservation[]>();
  for (const observation of ordered) {
    const key = `${observation.domain.toLowerCase()}\u0000${observation.prompt_query}\u0000${observation.model_name}`;
    byTuple.set(key, [...(byTuple.get(key) ?? []), observation]);
  }
  const changes: CitationChange[] = [];
  for (const sequence of byTuple.values()) for (let i = 1; i < sequence.length; i++) {
    const previous = sequence[i - 1], current = sequence[i];
    const before = urls(previous.extracted_urls_json), after = urls(current.extracted_urls_json);
    const lost = [...before].filter((url) => !after.has(url));
    const gained = [...after].filter((url) => !before.has(url));
    for (const url of gained) changes.push({ previous_observation_id: previous.id, current_observation_id: current.id, prompt_query: current.prompt_query, event_type: "citation_gained", source_url: url, replacement_url: null, new_replacement_url: null, replaced_by_competitor: false, evidence_json: { reason: "URL was absent in the immediately preceding observation and present in this one." } });
    for (const url of lost) changes.push({ previous_observation_id: previous.id, current_observation_id: current.id, prompt_query: current.prompt_query, event_type: "citation_lost", source_url: url, replacement_url: null, new_replacement_url: null, replaced_by_competitor: false, evidence_json: { reason: "URL was present in the immediately preceding observation and absent in this one." } });
    if (lost.length && gained.length) for (const source of lost) {
      const replacement = gained[0];
      let competitor = false;
      try { competitor = new URL(replacement).hostname.toLowerCase() !== current.domain.toLowerCase(); } catch {}
      changes.push({ previous_observation_id: previous.id, current_observation_id: current.id, prompt_query: current.prompt_query, event_type: "source_replaced", source_url: source, replacement_url: replacement, new_replacement_url: replacement, replaced_by_competitor: competitor, evidence_json: { reason: "A previously cited URL was dropped as another URL appeared in the same observation.", replacementCount: gained.length } });
    }
    // A break is recorded only when evidence explicitly says the URL was 200 and then degraded.
    const oldStatuses = statusMap(previous.url_status_json), newStatuses = statusMap(current.url_status_json);
    for (const source of before) {
      const oldStatus = oldStatuses[source], newStatus = newStatuses[source];
      if ((oldStatus === 200 || oldStatus === "200") && [404, 410, "timeout", 404, 410].includes(newStatus as never)) changes.push({ previous_observation_id: previous.id, current_observation_id: current.id, prompt_query: current.prompt_query, event_type: "url_broke", source_url: source, replacement_url: null, new_replacement_url: null, replaced_by_competitor: false, evidence_json: { previousStatus: 200, currentStatus: newStatus } });
    }
  }
  return changes;
}
