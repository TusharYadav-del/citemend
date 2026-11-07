import "server-only";
import { createServerDatabase } from "./supabase-server";
export { classifyEvidenceCategory, EVIDENCE_CATEGORY_LABELS } from "./evidence-categories";
export type { EvidenceCategory } from "./evidence-categories";

export type ObservationInput = {
  audit_id: string; domain: string; prompt_query: string; prompt_version?: string; provider: string;
  model_name: string; search_method: string; locale?: string; raw_answer: string; extracted_urls: string[];
  sample_size?: number; observation_confidence?: number | null; job_status?: "queued" | "running" | "completed" | "failed";
  retry_count?: number; error_message?: string | null; observed_at?: string;
};

export function normalizeObservation(input: ObservationInput) {
  if (!input.audit_id || !input.domain.trim() || !input.prompt_query.trim() || !input.provider.trim() || !input.model_name.trim() || !input.search_method.trim()) throw new TypeError("Observation requires audit, domain, prompt, provider, model, and search method.");
  if (!Array.isArray(input.extracted_urls) || input.extracted_urls.some(url => typeof url !== "string" || url.length > 2048)) throw new TypeError("Observation URLs must be bounded strings.");
  const confidence = input.observation_confidence ?? null;
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 100)) throw new RangeError("Observation confidence must be between 0 and 100.");
  return {
    audit_id: input.audit_id, domain: input.domain.trim().toLowerCase(), prompt_query: input.prompt_query.trim().slice(0, 4000),
    prompt_version: input.prompt_version ?? "v1", provider: input.provider.trim().slice(0, 100), model_name: input.model_name.trim().slice(0, 120),
    search_method: input.search_method.trim().slice(0, 100), locale: input.locale ?? "en-US", raw_answer: input.raw_answer.slice(0, 100_000),
    extracted_urls_json: [...new Set(input.extracted_urls)].slice(0, 100), sample_size: Math.min(100, Math.max(1, Math.floor(input.sample_size ?? 1))),
    observation_confidence: confidence, job_status: input.job_status ?? "completed", retry_count: Math.min(20, Math.max(0, Math.floor(input.retry_count ?? 0))),
    error_message: input.error_message?.slice(0, 1000) ?? null, observed_at: input.observed_at ?? new Date().toISOString(),
  };
}

export function nextObservationJobState(current: "queued" | "running" | "completed" | "failed", next: "queued" | "running" | "completed" | "failed", retries: number) {
  if (current === "completed") throw new Error("Completed observation jobs are immutable.");
  if (current === "queued" && next !== "running" && next !== "failed") throw new Error("Queued jobs can only start or fail.");
  if (current === "running" && next !== "completed" && next !== "failed") throw new Error("Running jobs can only complete or fail.");
  if (current === "failed" && next !== "queued") throw new Error("Failed jobs must be requeued before running.");
  const retryCount = current === "failed" && next === "queued" ? retries + 1 : retries;
  if (retryCount > 5) throw new Error("Observation retry limit reached.");
  return { job_status: next, retry_count: retryCount };
}

export async function advanceObservationJob(id: string, next: "queued" | "running" | "completed" | "failed", errorMessage?: string) {
  const db = createServerDatabase();
  const current = await db.from("ai_observation_evidence").select("job_status,retry_count").eq("id", id).maybeSingle();
  if (current.error || !current.data) throw new Error("Observation job was not found.");
  const transition = nextObservationJobState(current.data.job_status as "queued" | "running" | "completed" | "failed", next, current.data.retry_count);
  const updated = await db.from("ai_observation_evidence").update({ ...transition, error_message: next === "failed" ? (errorMessage ?? "Scan failed.").slice(0, 1000) : null }).eq("id", id).eq("job_status", current.data.job_status).eq("retry_count", current.data.retry_count).select("id,job_status,retry_count,error_message").maybeSingle();
  if (updated.error || !updated.data) throw new Error("Observation job changed concurrently; retry the status update.");
  return updated.data;
}

export async function recordObservation(input: ObservationInput) {
  const row = normalizeObservation(input);
  const { data, error } = await createServerDatabase().from("ai_observation_evidence").insert({ ...row, extracted_urls_json: row.extracted_urls_json }).select("id,audit_id,domain,prompt_query,provider,model_name,job_status,retry_count,observed_at").single();
  if (error || !data) throw new Error("Could not save reproducible AI observation evidence.");
  return data;
}
