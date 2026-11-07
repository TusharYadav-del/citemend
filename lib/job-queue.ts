import "server-only";
import type { createServerDatabase } from "./supabase-server";
import { normalizeIdempotencyKey, type BackgroundJobType } from "./job-queue-core";

type Db = ReturnType<typeof createServerDatabase>;
export type BackgroundJobRow = {
  id: string; user_id: string; workspace_domain: string; job_type: string; job_key: string;
  status: string; progress_percent: number; current_step_label: string; payload_json: Record<string, unknown>;
  result_json: Record<string, unknown> | null; attempt_count: number; max_attempts: number; continuation_pending: boolean;
  next_retry_at: string; lease_token: string | null; lease_expires_at: string | null;
  error_message: string | null; created_at: string; updated_at: string; completed_at: string | null;
};

export async function enqueueBackgroundJob(db: Db, input: {
  userId: string; domain: string; type: BackgroundJobType; key: string; payload: Record<string, unknown>;
}) {
  const encoded = JSON.stringify(input.payload);
  if (Buffer.byteLength(encoded, "utf8") > 1_500_000) throw new RangeError("Background job payload exceeds 1.5 MB.");
  const key = normalizeIdempotencyKey(input.key, input.key);
  const { data, error } = await db.rpc("enqueue_background_job", {
    p_user_id: input.userId, p_workspace_domain: input.domain, p_job_type: input.type,
    p_job_key: key, p_payload_json: input.payload,
  });
  if (error) {
    if (/queue is full|rate limit reached/i.test(error.message ?? "")) throw new Error(error.message);
    throw new Error("Background job could not be queued.");
  }
  const row = ((data ?? []) as unknown as BackgroundJobRow[])[0];
  if (!row) throw new Error("Queued job could not be read back.");
  return { id: row.id, status: row.status, progress_percent: row.progress_percent, current_step_label: row.current_step_label, created_at: row.created_at, payload_json: row.payload_json };
}

export async function claimBackgroundJob(db: Db, leaseSeconds = 240): Promise<BackgroundJobRow | null> {
  const { data, error } = await db.rpc("claim_background_job", { p_lease_seconds: leaseSeconds });
  if (error) throw new Error("Background job queue is unavailable.");
  return ((data ?? [])[0] as BackgroundJobRow | undefined) ?? null;
}

export async function advanceBackgroundJob(db: Db, job: BackgroundJobRow, payload: Record<string, unknown>, progress: number, label: string) {
  if (!job.lease_token) throw new Error("The background job lease is missing.");
  const { data, error } = await db.rpc("advance_background_job", {
    p_job_id: job.id, p_lease_token: job.lease_token, p_payload_json: payload,
    p_progress_percent: progress, p_step_label: label,
  });
  if (error || data !== true) throw new Error("Background job lease was lost before progress could be saved.");
}

export async function reportBackgroundJobProgress(db: Db, job: BackgroundJobRow, progress: number, label: string) {
  if (!job.lease_token) throw new Error("The background job lease is missing.");
  const { data, error } = await db.rpc("report_background_job_progress", {
    p_job_id: job.id, p_lease_token: job.lease_token, p_progress_percent: progress, p_step_label: label,
    p_lease_seconds: 300,
  });
  if (error || data !== true) throw new Error("Background job progress could not be saved.");
}

export async function completeBackgroundJob(db: Db, job: BackgroundJobRow, result: Record<string, unknown>) {
  if (!job.lease_token) throw new Error("The background job lease is missing.");
  const { data, error } = await db.rpc("complete_background_job", { p_job_id: job.id, p_lease_token: job.lease_token, p_result_json: result });
  if (error || data !== true) throw new Error("Background job lease was lost before completion.");
}

export async function retryBackgroundJob(db: Db, job: BackgroundJobRow, errorMessage: string) {
  if (!job.lease_token) throw new Error("The background job lease is missing.");
  const { data, error } = await db.rpc("retry_background_job", {
    p_job_id: job.id, p_lease_token: job.lease_token,
    p_safe_error: errorMessage.slice(0, 500),
  });
  if (error) throw new Error("Background job retry state could not be saved.");
  return data;
}

export { exponentialRetryDelayMs, normalizeIdempotencyKey, normalizeJobProgress } from "./job-queue-core";
