export type BackgroundJobStatus = "queued" | "running" | "completed" | "failed" | "retrying";
export type BackgroundJobType = "audit_scan" | "audit_enrichment" | "listicle_crawl" | "ecommerce_sync";

export function normalizeJobProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(99, Math.round(value))) : 0;
}

export function exponentialRetryDelayMs(attemptCount: number): number {
  const attempt = Math.max(1, Math.floor(Number.isFinite(attemptCount) ? attemptCount : 1));
  return Math.min(60 * 60_000, 15_000 * 2 ** Math.min(attempt - 1, 8));
}

export function normalizeIdempotencyKey(value: string | null | undefined, fallback: string): string {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  if (candidate.length > 160 || /[\u0000-\u001f\u007f]/.test(candidate)) throw new TypeError("Idempotency-Key must be at most 160 printable characters.");
  return candidate;
}

export function isRetryableJobStatus(status: string): status is "queued" | "retrying" {
  return status === "queued" || status === "retrying";
}
