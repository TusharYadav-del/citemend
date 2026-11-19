import "server-only";
import { publicFetch } from "./public-http";

export type LinkHealthClass = "healthy" | "redirect" | "permanent_dead" | "temporary_failure" | "blocked" | "unknown";
export type LinkHealthProbe = { httpStatus: number | null; state?: string; error?: string | null };
export type LinkHealthResult = {
  classification: LinkHealthClass;
  httpStatus: number | null;
  attempts: number;
  retryable: boolean;
  error: string | null;
};
export type WaybackSnapshot = { url: string; capturedAt: string; originalStatus: number };
export type WaybackFetcher = (value: string | URL, init: RequestInit) => Promise<Response>;

export type LinkHealthDependencies = {
  maxAttempts?: number;
  wait?: (milliseconds: number) => Promise<void>;
};

function classify(probe: LinkHealthProbe): { classification: LinkHealthClass; retryable: boolean } {
  const status = probe.httpStatus;
  if (status === 404 || status === 410) return { classification: "permanent_dead", retryable: false };
  if (status === 429 || status === 408 || status === 425 || status !== null && status >= 500) return { classification: "temporary_failure", retryable: true };
  if (probe.state === "timeout" || /timeout|timed out|network|fetch failed|econnreset|econnrefused|temporarily unavailable|socket hang up/i.test(probe.error ?? "")) {
    return { classification: "temporary_failure", retryable: true };
  }
  if (probe.state === "blocked" || status === 401 || status === 403 || status === 451) return { classification: "blocked", retryable: false };
  if (status !== null && status >= 200 && status < 300) return { classification: "healthy", retryable: false };
  if (status !== null && status >= 300 && status < 400) return { classification: "redirect", retryable: false };
  return { classification: "unknown", retryable: false };
}

/** Retries transient HTTP/network failures with bounded exponential backoff. 404/410 are conclusive. */
export async function checkLinkHealth(
  check: () => Promise<LinkHealthProbe>,
  dependencies: LinkHealthDependencies = {},
): Promise<LinkHealthResult> {
  const maxAttempts = Math.max(1, Math.min(3, Math.floor(dependencies.maxAttempts ?? 3)));
  const wait = dependencies.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  let last: LinkHealthProbe = { httpStatus: null, error: "The URL check did not complete." };
  let classification: ReturnType<typeof classify> = { classification: "unknown", retryable: false };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { last = await check(); }
    catch (error) { last = { httpStatus: null, error: error instanceof Error ? error.message : "The URL check failed." }; }
    classification = classify(last);
    if (!classification.retryable || attempt === maxAttempts) {
      return { classification: classification.classification, httpStatus: last.httpStatus, attempts: attempt, retryable: classification.retryable, error: last.error ?? null };
    }
    await wait(150 * 2 ** (attempt - 1));
  }
  return { classification: classification.classification, httpStatus: last.httpStatus, attempts: maxAttempts, retryable: classification.retryable, error: last.error ?? null };
}

/** Confirms a suggested replacement resolves directly to HTTP 200 on the customer domain. */
export async function verifyLiveReplacementUrl(value: string, domain: string, check: (url: string) => Promise<number>) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const customerDomain = domain.toLowerCase().replace(/^www\./, "");
    if (!(url.protocol === "https:" || url.protocol === "http:") || url.username || url.password
      || !(host === customerDomain || host.endsWith(`.${customerDomain}`))) return { live: false, temporaryFailure: false };
    const health = await checkLinkHealth(async () => ({ httpStatus: await check(url.href) }));
    return { live: health.classification === "healthy" && health.httpStatus === 200, temporaryFailure: health.classification === "temporary_failure" };
  } catch { return { live: false, temporaryFailure: false }; }
}

/** Looks up a historical capture through the fixed Internet Archive Availability API. */
export async function lookupWaybackSnapshot(
  value: string,
  fetcher: WaybackFetcher = publicFetch,
): Promise<WaybackSnapshot | null> {
  let source: URL;
  try {
    source = new URL(value);
    if (!(source.protocol === "https:" || source.protocol === "http:") || source.username || source.password) return null;
    source.hash = "";
  } catch { return null; }
  try {
    const api = new URL("https://archive.org/wayback/available");
    api.searchParams.set("url", source.href);
    const response = await fetcher(api, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(4_000), headers: { Accept: "application/json" } });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > 32_768) { await reader.cancel(); return null; }
        chunks.push(chunk);
      }
    } finally { reader.releaseLock(); }
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!payload || typeof payload !== "object") return null;
    const closest = (payload as { archived_snapshots?: { closest?: unknown } }).archived_snapshots?.closest;
    if (!closest || typeof closest !== "object") return null;
    const entry = closest as { available?: unknown; url?: unknown; timestamp?: unknown; status?: unknown; statuscode?: unknown };
    if (entry.available !== true || typeof entry.url !== "string" || typeof entry.timestamp !== "string") return null;
    const snapshot = new URL(entry.url);
    const timestamp = entry.timestamp;
    const originalStatus = Number(entry.statuscode ?? entry.status);
    if (snapshot.protocol !== "https:" || snapshot.hostname !== "web.archive.org" || !/^\/web\/\d{14}(?:id_)?\//.test(snapshot.pathname)
      || !/^\d{14}$/.test(timestamp) || !Number.isInteger(originalStatus) || originalStatus < 100 || originalStatus > 599) return null;
    const capturedAt = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`;
    return { url: snapshot.href, capturedAt, originalStatus };
  } catch { return null; }
}

export function failedDestinationKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (!(url.protocol === "https:" || url.protocol === "http:") || url.username || url.password) return null;
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    url.hash = "";
    return url.href;
  } catch { return null; }
}

export function draftReplacementSnippet(liveUrl: string): string | null {
  const key = failedDestinationKey(liveUrl);
  if (!key) return null;
  try {
    const url = new URL(key);
    const slug = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "").replace(/[-_]+/g, " ").replace(/\.[a-z0-9]{1,8}$/i, "").trim();
    const label = slug ? slug.slice(0, 100) : "Related resource";
    return `Suggested replacement link: “${label}” — ${url.href}`;
  } catch { return null; }
}
