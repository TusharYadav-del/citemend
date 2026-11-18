import "server-only";
import { publicFetch } from "../public-http";

export type CloudflareBulkRedirect = { source_url: string; target_url: string; status_code: 301 };
export type RedirectVerification = {
  ok: boolean;
  oldUrlStatus: number | null;
  location: string | null;
  destinationStatus: number | null;
  reason: string;
};

function ownedUrl(value: string, domain: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname.toLowerCase() !== domain.toLowerCase() || url.hash) {
    throw new Error("Redirect URLs must use HTTPS on the verified workspace domain.");
  }
  return url;
}

function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }

export function cloudflareRows(domain: string, rows: { dead_url: string; suggested_target_url: string | null }[]): CloudflareBulkRedirect[] {
  return rows.flatMap(row => {
    if (!row.suggested_target_url) return [];
    const source = ownedUrl(row.dead_url, domain);
    const target = ownedUrl(row.suggested_target_url, domain);
    if (source.href === target.href) throw new Error("Source and target URLs must differ.");
    return [{ source_url: source.href, target_url: target.href, status_code: 301 as const }];
  });
}

export function formatCloudflareRedirects(rows: CloudflareBulkRedirect[], format: "csv" | "json"): string {
  if (format === "json") return `${JSON.stringify(rows, null, 2)}\n`;
  return ["source_url,target_url,status_code", ...rows.map(row => [row.source_url, row.target_url, String(row.status_code)].map(csvCell).join(","))].join("\n") + "\n";
}

/** Checks exactly one redirect hop and a live 200 destination; redirects are never auto-followed. */
export async function verifyDeployedRedirect(deadUrl: string, suggestedTargetUrl: string, domain: string, fetcher: typeof publicFetch = publicFetch): Promise<RedirectVerification> {
  let source: URL;
  let target: URL;
  try { source = ownedUrl(deadUrl, domain); target = ownedUrl(suggestedTargetUrl, domain); }
  catch (error) { return { ok: false, oldUrlStatus: null, location: null, destinationStatus: null, reason: error instanceof Error ? error.message : "Invalid redirect URL." }; }
  try {
    const response = await fetcher(source, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "CiteMend-Redirect-Verifier/1.0" } });
    const locationHeader = response.headers.get("location");
    if (response.status !== 301 && response.status !== 302) return { ok: false, oldUrlStatus: response.status, location: locationHeader, destinationStatus: null, reason: "The old URL did not return HTTP 301 or 302." };
    if (!locationHeader) return { ok: false, oldUrlStatus: response.status, location: null, destinationStatus: null, reason: "The redirect response did not include a Location header." };
    let resolved: URL;
    try { resolved = new URL(locationHeader, source); }
    catch { return { ok: false, oldUrlStatus: response.status, location: locationHeader, destinationStatus: null, reason: "The redirect Location is invalid." }; }
    if (resolved.href !== target.href) return { ok: false, oldUrlStatus: response.status, location: resolved.href, destinationStatus: null, reason: "The redirect does not point directly to the approved target URL." };
    const destination = await fetcher(target, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "CiteMend-Redirect-Verifier/1.0" } });
    if (destination.status !== 200) return { ok: false, oldUrlStatus: response.status, location: resolved.href, destinationStatus: destination.status, reason: "The exact destination does not return HTTP 200 without another redirect." };
    return { ok: true, oldUrlStatus: response.status, location: resolved.href, destinationStatus: destination.status, reason: "The old URL redirects directly to the approved live HTTP 200 destination." };
  } catch {
    return { ok: false, oldUrlStatus: null, location: null, destinationStatus: null, reason: "The live redirect check could not reach the public URLs." };
  }
}
