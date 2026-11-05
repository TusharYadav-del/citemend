export type GraphObjectType = "Brand" | "Prompt" | "Model" | "Observation" | "Publisher" | "URL" | "Action" | "Evidence" | "Outcome";
export type GraphObject = { type: GraphObjectType; id: string; at: string; label: string; data: Record<string, unknown> };
export type GraphEdge = { from: string; to: string; relation: "asks" | "observed_as" | "cites" | "published_at" | "triggered" | "supported_by" | "resulted_in" };
const objectKey = (type: GraphObjectType, id: string) => `${type}:${id}`;
export function buildIntelligenceTimeline(input: { domain: string; prompt?: string | null; observations?: Record<string, unknown>[]; opportunities?: Record<string, unknown>[]; actions?: Record<string, unknown>[]; outcomes?: Record<string, unknown>[] }) {
  const objects: GraphObject[] = [{ type: "Brand", id: input.domain, at: "", label: input.domain, data: { domain: input.domain } }];
  if (input.prompt) objects.push({ type: "Prompt", id: input.prompt, at: "", label: input.prompt, data: { prompt: input.prompt } });
  for (const observation of input.observations ?? []) {
    const id = String(observation.id); const at = String(observation.observed_at ?? "");
    objects.push({ type: "Model", id: String(observation.model_name ?? observation.provider ?? "unknown"), at, label: String(observation.model_name ?? observation.provider ?? "Model"), data: { provider: observation.provider } });
    objects.push({ type: "Observation", id, at, label: `AI observation · ${String(observation.prompt_query ?? "")}`, data: observation });
    objects.push({ type: "Evidence", id: String(observation.id), at, label: "Reproducible observation evidence", data: { extracted_urls_json: observation.extracted_urls_json, sample_size: observation.sample_size } });
    const urls = Array.isArray(observation.extracted_urls_json) ? observation.extracted_urls_json : [];
    for (const url of urls) if (typeof url === "string") { try { const publisher = new URL(url).hostname; objects.push({ type: "Publisher", id: publisher, at, label: publisher, data: {} }); objects.push({ type: "URL", id: url, at, label: url, data: { publisher } }); } catch {} }
  }
  for (const opportunity of input.opportunities ?? []) objects.push({ type: "Action", id: String(opportunity.id), at: String(opportunity.created_at ?? ""), label: String(opportunity.opportunity_type ?? "Recovery opportunity"), data: opportunity });
  for (const action of input.actions ?? []) objects.push({ type: "Action", id: String(action.id), at: String(action.created_at ?? ""), label: String(action.action_type ?? "Recovery action"), data: action });
  for (const outcome of input.outcomes ?? []) objects.push({ type: "Outcome", id: String(outcome.id), at: String(outcome.ai_citation_observed_at ?? outcome.technical_deployment_verified_at ?? outcome.created_at ?? ""), label: outcome.ai_citation_observed_at ? "AI citation observed" : outcome.technical_deployment_verified_at ? "Technical deployment verified" : "Outcome pending", data: outcome });
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
  const actionObjects = objects.filter(object => object.type === "Action");
  for (const outcome of objects.filter(object => object.type === "Outcome")) {
    const latestAction = actionObjects.filter(action => !outcome.at || !action.at || action.at <= outcome.at).at(-1);
    if (latestAction) edges.push({ from: objectKey("Action", latestAction.id), to: objectKey("Outcome", outcome.id), relation: "resulted_in" });
  }
  return { objects, edges };
}
