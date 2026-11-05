export const AGENT_STEPS = ["discover", "investigate", "recommend", "request_approval", "execute", "verify", "rollback"] as const;
export type AgentStep = (typeof AGENT_STEPS)[number];
export const AGENT_ACTIONS = ["capsule_draft", "jsonld_recommendation", "forensic_diagnosis", "llms_txt_preview", "entity_baseline_update", "schedule_reverification", "shopify_301_deploy", "vercel_301_export", "cloudflare_301_export", "publisher_outreach_draft"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];
export type AgentRisk = "low_risk_auto" | "medium_risk_review" | "high_risk_external_approval";
export type AgentState = { current_step: AgentStep; run_status: string; risk_level: AgentRisk; human_approved_by?: string | null; rollback_snapshot_json?: Record<string, unknown> | null };

const LOW_RISK = new Set<AgentAction>(["capsule_draft", "jsonld_recommendation", "forensic_diagnosis", "llms_txt_preview"]);
const MEDIUM_RISK = new Set<AgentAction>(["entity_baseline_update", "schedule_reverification"]);
export function isAgentAction(value: unknown): value is AgentAction { return typeof value === "string" && (AGENT_ACTIONS as readonly string[]).includes(value); }
export function riskForAgentAction(action: AgentAction): AgentRisk {
  if (LOW_RISK.has(action)) return "low_risk_auto";
  if (MEDIUM_RISK.has(action)) return "medium_risk_review";
  return "high_risk_external_approval";
}
export function nextAgentStep(current: AgentStep, next: AgentStep): boolean {
  const index = AGENT_STEPS.indexOf(current);
  return index >= 0 && next === AGENT_STEPS[index + 1] || current === "verify" && next === "rollback";
}
export function canExecuteAgentAction(input: { action: AgentAction; humanApproved: boolean; safetyChecksPassed: boolean; rollbackSnapshot: unknown }): boolean {
  const risk = riskForAgentAction(input.action);
  if (risk === "low_risk_auto") return true;
  if (!input.humanApproved || !input.rollbackSnapshot || typeof input.rollbackSnapshot !== "object") return false;
  const requiresRedirectSafety = ["shopify_301_deploy", "vercel_301_export", "cloudflare_301_export"].includes(input.action);
  return !requiresRedirectSafety || input.safetyChecksPassed;
}
export function buildAgentStageHistory(startedAt: string, finishedAt = startedAt) {
  return AGENT_STEPS.slice(0, 4).map((step, index) => ({ step, at: index === 0 ? startedAt : finishedAt }));
}
export function rollbackAgentSnapshot(snapshot: unknown): Record<string, unknown> {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new TypeError("A saved rollback snapshot is required.");
  const record = snapshot as Record<string, unknown>;
  if (!Object.hasOwn(record, "previous_state")) throw new TypeError("Rollback snapshot is missing previous_state.");
  const state = record.previous_state;
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new TypeError("Rollback snapshot previous_state must be a JSON object.");
  return structuredClone(state as Record<string, unknown>);
}
