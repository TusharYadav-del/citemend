export type ModelId = "chatgpt_search" | "perplexity_sonar" | "google_gemini" | "claude";
export const MODEL_PROFILE_NAMES = ["ChatGPT Search", "Perplexity Sonar", "Google Gemini", "Claude"] as const;
export type ModelDefinition = {
  id: ModelId;
  displayName: "ChatGPT Search" | "Perplexity Sonar" | "Google Gemini" | "Claude";
  provider: string;
  model: string;
  fallbackModel?: string;
  timeoutMs: number;
  /** Internal configurable estimate per model invocation; null until the operator sets a cost assumption. */
  estimatedCostUsdPerCall: number | null;
  profileKind: "shared_grounding" | "synthesis_simulation";
};

function readString(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value && value.length <= 120 ? value : fallback;
}
function readTimeout(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 1000 && value <= 120_000 ? value : fallback;
}
function readCost(name: string, conservativeDefault: number) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return conservativeDefault;
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0 && cost <= 100 ? cost : null;
}

/**
 * Conservative USD budgets per profile invocation, not metered provider usage.
 * They assume bounded prompt/answer sizes and include one basic Tavily search
 * in ChatGPT Search. Gemini uses the standard rate effective 2027-01-01.
 */
export const DEFAULT_MODEL_COST_USD_PER_CALL = {
  chatgpt_search: 0.012,
  perplexity_sonar: 0.001,
  google_gemini: 0.014,
  claude: 0.001,
} as const;

/**
 * Version/cost/timeout registry for the four dashboard model profiles.
 * Perplexity and Claude are explicitly marked as synthesis simulations; this app
 * currently does not query their native APIs. ChatGPT Search uses the configured
 * Groq/Tavily shared-grounding pipeline, not a native OpenAI Search request.
 */
export function getModelRegistry(): Record<ModelId, ModelDefinition> {
  return {
    chatgpt_search: { id: "chatgpt_search", displayName: "ChatGPT Search", provider: "Groq + Tavily shared grounding", model: readString("GROQ_MODEL", "openai/gpt-oss-120b"), timeoutMs: readTimeout("CITEMEND_CHATGPT_SEARCH_TIMEOUT_MS", 45_000), estimatedCostUsdPerCall: readCost("CITEMEND_MODEL_COST_CHATGPT_SEARCH_USD_PER_CALL", DEFAULT_MODEL_COST_USD_PER_CALL.chatgpt_search), profileKind: "shared_grounding" },
    perplexity_sonar: { id: "perplexity_sonar", displayName: "Perplexity Sonar", provider: "Groq profile simulation", model: readString("CITEMEND_PERPLEXITY_PROFILE_MODEL", "openai/gpt-oss-20b"), timeoutMs: readTimeout("CITEMEND_PERPLEXITY_PROFILE_TIMEOUT_MS", 6_000), estimatedCostUsdPerCall: readCost("CITEMEND_MODEL_COST_PERPLEXITY_SONAR_USD_PER_CALL", DEFAULT_MODEL_COST_USD_PER_CALL.perplexity_sonar), profileKind: "synthesis_simulation" },
    google_gemini: { id: "google_gemini", displayName: "Google Gemini", provider: "Google Gemini API (Groq simulation fallback)", model: readString("CITEMEND_GOOGLE_GEMINI_MODEL", "gemini-3.8-flash"), fallbackModel: readString("CITEMEND_GOOGLE_GEMINI_FALLBACK_MODEL", "openai/gpt-oss-20b"), timeoutMs: readTimeout("CITEMEND_GOOGLE_GEMINI_TIMEOUT_MS", 5_000), estimatedCostUsdPerCall: readCost("CITEMEND_MODEL_COST_GOOGLE_GEMINI_USD_PER_CALL", DEFAULT_MODEL_COST_USD_PER_CALL.google_gemini), profileKind: "synthesis_simulation" },
    claude: { id: "claude", displayName: "Claude", provider: "Groq profile simulation", model: readString("CITEMEND_CLAUDE_PROFILE_MODEL", "openai/gpt-oss-20b"), timeoutMs: readTimeout("CITEMEND_CLAUDE_PROFILE_TIMEOUT_MS", 6_000), estimatedCostUsdPerCall: readCost("CITEMEND_MODEL_COST_CLAUDE_USD_PER_CALL", DEFAULT_MODEL_COST_USD_PER_CALL.claude), profileKind: "synthesis_simulation" },
  };
}

export function getModelDefinition(id: ModelId) { return getModelRegistry()[id]; }

export function estimateAuditModelCostUsd(promptCount: number) {
  const registry = getModelRegistry();
  const models = Object.values(registry);
  const missingCostModels = models.filter((model) => model.estimatedCostUsdPerCall === null).map((model) => model.id);
  const rawCost = missingCostModels.length ? null : Math.max(1, Math.floor(promptCount)) * models.reduce((sum, model) => sum + (model.estimatedCostUsdPerCall ?? 0), 0);
  const cost = rawCost === null ? null : Math.round(rawCost * 1_000_000) / 1_000_000;
  return { estimatedCostUsd: cost, promptCount: Math.max(1, Math.floor(promptCount)), assumedModelCallsPerPrompt: models.length, missingCostModels, estimateOnly: true as const };
}
