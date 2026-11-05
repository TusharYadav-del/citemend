export type GraphObjectType = "Brand" | "Prompt" | "Model" | "Observation" | "Publisher" | "URL" | "Action" | "Evidence" | "Outcome";
export type GraphObject = { type: GraphObjectType; id: string; at: string; label: string; data: Record<string, unknown> };
export type GraphEdge = { from: string; to: string; relation: "asks" | "observed_as" | "cites" | "published_at" | "triggered" | "supported_by" | "resulted_in" | "disappeared" | "replaced" };
const objectKey = (type: GraphObjectType, id: string) => `${type}:${id}`;
export function buildIntelligenceTimeline(input: { domain: string; prompt?: string | null; observations?: Record<string, unknown>[]; opportunities?: Record<string, unknown>[]; actions?: Record<string, unknown>[]; outcomes?: Record<string, unknown>[] }) {
  const objects: GraphObject[] = [{ type: "Brand", id: input.domain, at: "", label: input.domain, data: { domain: input.domain } }];
  if (input.prompt) objects.push({ type: "Prompt", id: input.prompt, at: "", label: input.prompt, data: { prompt: input.prompt } });
  const modelIds = new Set<string>(); const publisherIds = new Set<string>(); const urlIds = new Set<string>();
  for (const observation of input.observations ?? []) {
    const id = String(observation.id); const at = String(observation.observed_at ?? "");
    const modelId = String(observation.model_name ?? observation.provider ?? "unknown");
    if (!modelIds.has(modelId)) { modelIds.add(modelId); objects.push({ type: "Model", id: modelId, at, label: modelId, data: { provider: observation.provider } }); }
    objects.push({ type: "Observation", id, at, label: `AI observation · ${String(observation.prompt_query ?? "")}`, data: observation });
    objects.push({ type: "Evidence", id: String(observation.id), at, label: "Reproducible observation evidence", data: { extracted_urls_json: observation.extracted_urls_json, sample_size: observation.sample_size } });
    const urls = Array.isArray(observation.extracted_urls_json) ? observation.extracted_urls_json : [];
    for (const url of urls) if (typeof url === "string") { try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol)) continue; const publisher = parsed.hostname; if (!publisherIds.has(publisher)) { publisherIds.add(publisher); objects.push({ type: "Publisher", id: publisher, at, label: publisher, data: {} }); } if (!urlIds.has(url)) { urlIds.add(url); objects.push({ type: "URL", id: url, at, label: url, data: { publisher } }); } } catch {} }
  }
  for (const opportunity of input.opportunities ?? []) {
    objects.push({ type: "Action", id: String(opportunity.id), at: String(opportunity.created_at ?? ""), label: String(opportunity.opportunity_type ?? "Recovery opportunity"), data: opportunity });
    const history = Array.isArray(opportunity.stage_history_json) ? opportunity.stage_history_json : [];
    for (const event of history) if (event && typeof event === "object") { const row = event as Record<string, unknown>; const at = typeof row.at === "string" ? row.at : ""; const stage = String(row.stage ?? "stage updated"); objects.push({ type: "Action", id: `${opportunity.id}:${stage}:${at}`, at, label: `Opportunity ${stage}${typeof row.note === "string" && row.note ? `: ${row.note}` : ""}`, data: { opportunityId: opportunity.id, stage, actor_user_id: row.actor_user_id ?? null, note: row.note ?? "" } }); }
  }
  for (const action of input.actions ?? []) objects.push({ type: "Action", id: String(action.id), at: String(action.created_at ?? ""), label: String(action.action_type ?? "Recovery action"), data: action });
  for (const outcome of input.outcomes ?? []) objects.push({ type: "Outcome", id: String(outcome.id), at: String(outcome.ai_citation_observed_at ?? outcome.technical_deployment_verified_at ?? outcome.created_at ?? ""), label: outcome.ai_citation_observed_at ? "AI citation observed" : outcome.technical_deployment_verified_at ? "Technical deployment verified" : "Outcome pending", data: outcome });
  const chronological = [...(input.observations ?? [])].sort((a, b) => String(a.observed_at ?? "").localeCompare(String(b.observed_at ?? "")));
  const byPrompt = new Map<string, Record<string, unknown>[]>();
  for (const observation of chronological) { const prompt = String(observation.prompt_query ?? input.prompt ?? ""); byPrompt.set(prompt, [...(byPrompt.get(prompt) ?? []), observation]); }
  for (const [prompt, sequence] of byPrompt) for (let index = 1; index < sequence.length; index++) {
    const previous = sequence[index - 1]; const current = sequence[index];
    const oldUrls = new Set((Array.isArray(previous.extracted_urls_json) ? previous.extracted_urls_json : []).filter((url): url is string => typeof url === "string"));
    const newUrls = new Set((Array.isArray(current.extracted_urls_json) ? current.extracted_urls_json : []).filter((url): url is string => typeof url === "string"));
    const removed = [...oldUrls].filter(url => !newUrls.has(url)); const added = [...newUrls].filter(url => !oldUrls.has(url));
    for (const url of removed) objects.push({ type: "Evidence", id: `citation-disappeared:${current.id}:${url}`, at: String(current.observed_at ?? ""), label: `Citation disappeared: ${url}`, data: { prompt, previousObservationId: previous.id, currentObservationId: current.id, url, evidence: "Present in the preceding saved observation and absent from this subsequent observation." } });
    for (const url of added) objects.push({ type: "Evidence", id: `citation-appeared:${current.id}:${url}`, at: String(current.observed_at ?? ""), label: `Citation appeared: ${url}`, data: { prompt, previousObservationId: previous.id, currentObservationId: current.id, url, evidence: "Absent from the preceding saved observation and present in this subsequent observation." } });
    for (const url of [...removed, ...added]) if (!urlIds.has(url)) { try { const publisher = new URL(url).hostname; urlIds.add(url); objects.push({ type: "URL", id: url, at: String(current.observed_at ?? ""), label: url, data: { publisher } }); } catch {} }
  }
  return objects.sort((a, b) => a.at.localeCompare(b.at) || a.type.localeCompare(b.type));
}

export function buildIntelligenceGraph(input: Parameters<typeof buildIntelligenceTimeline>[0]) {
  const objects = buildIntelligenceTimeline(input);
  const edges: GraphEdge[] = [];
  for (const observation of input.observations ?? []) {
    const observationId = String(observation.id);
    const prompt = String(observation.prompt_query ?? input.prompt ?? "");
    const modelId = String(observation.model_name ?? observation.provider ?? "unknown");
    if (prompt) edges.push({ from: objectKey("Brand", input.domain), to: objectKey("Prompt", prompt), relation: "asks" }, { from: objectKey("Prompt", prompt), to: objectKey("Model", modelId), relation: "observed_as" });
    edges.push({ from: objectKey("Model", modelId), to: objectKey("Observation", observationId), relation: "observed_as" }, { from: objectKey("Observation", observationId), to: objectKey("Evidence", observationId), relation: "supported_by" });
    const urls = Array.isArray(observation.extracted_urls_json) ? observation.extracted_urls_json : [];
    for (const value of urls) if (typeof value === "string") { try { const host = new URL(value).hostname; edges.push({ from: objectKey("Observation", observationId), to: objectKey("URL", value), relation: "cites" }, { from: objectKey("URL", value), to: objectKey("Publisher", host), relation: "published_at" }); } catch {} }
  }
  const chronological = [...(input.observations ?? [])].sort((a, b) => String(a.observed_at ?? "").localeCompare(String(b.observed_at ?? "")));
  const byPrompt = new Map<string, Record<string, unknown>[]>();
  for (const observation of chronological) { const prompt = String(observation.prompt_query ?? input.prompt ?? ""); byPrompt.set(prompt, [...(byPrompt.get(prompt) ?? []), observation]); }
  for (const [prompt, sequence] of byPrompt) for (let index = 1; index < sequence.length; index++) {
    const previous = sequence[index - 1]; const current = sequence[index];
    const oldUrls = new Set((Array.isArray(previous.extracted_urls_json) ? previous.extracted_urls_json : []).filter((url): url is string => typeof url === "string"));
    const newUrls = new Set((Array.isArray(current.extracted_urls_json) ? current.extracted_urls_json : []).filter((url): url is string => typeof url === "string"));
    const removed = [...oldUrls].filter(url => !newUrls.has(url)).slice(0, 20); const added = [...newUrls].filter(url => !oldUrls.has(url)).slice(0, 20);
    for (const url of removed) { const evidenceId = `citation-disappeared:${current.id}:${url}`; edges.push({ from: objectKey("Observation", String(current.id)), to: objectKey("URL", url), relation: "disappeared" }, { from: objectKey("Observation", String(current.id)), to: objectKey("Evidence", evidenceId), relation: "supported_by" }); }
    for (const url of added) { const evidenceId = `citation-appeared:${current.id}:${url}`; edges.push({ from: objectKey("Observation", String(current.id)), to: objectKey("URL", url), relation: "cites" }, { from: objectKey("Observation", String(current.id)), to: objectKey("Evidence", evidenceId), relation: "supported_by" }); }
    if (removed.length && added.length) for (const oldUrl of removed) for (const newUrl of added) edges.push({ from: objectKey("URL", oldUrl), to: objectKey("URL", newUrl), relation: "replaced" });
    void prompt;
  }
  for (const opportunity of input.opportunities ?? []) {
    const prompt = String(opportunity.prompt_query ?? input.prompt ?? "");
    const discovery = chronological.find(item => String(item.prompt_query ?? input.prompt ?? "") === prompt);
    if (discovery) edges.push({ from: objectKey("Observation", String(discovery.id)), to: objectKey("Action", String(opportunity.id)), relation: "triggered" });
    const history = Array.isArray(opportunity.stage_history_json) ? opportunity.stage_history_json : [];
    let priorId = String(opportunity.id);
    for (const event of history) if (event && typeof event === "object") { const row = event as Record<string, unknown>; const nextId = `${opportunity.id}:${String(row.stage ?? "stage updated")}:${String(row.at ?? "")}`; edges.push({ from: objectKey("Action", priorId), to: objectKey("Action", nextId), relation: "triggered" }); priorId = nextId; }
  }
  const actionObjects = objects.filter(object => object.type === "Action");
  for (const outcome of objects.filter(object => object.type === "Outcome")) {
    const latestAction = actionObjects.filter(action => !outcome.at || !action.at || action.at <= outcome.at).at(-1);
    if (latestAction) edges.push({ from: objectKey("Action", latestAction.id), to: objectKey("Outcome", outcome.id), relation: "resulted_in" });
  }
  return { objects, edges };
}
