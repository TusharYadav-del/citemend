import { normalizeDashboardDomain } from "../audit-dashboard";
import { normalizeRecoveryUrl } from "./normalize";

export type RecoverySignal = { domain: string; normalizedPath: string; referrerHost: string | null; origin: string };

/** Parse a site-reported 404 signal without accepting a user-agent as crawler proof. */
export function parseRecoverySignal(value: unknown, requestOrigin: string | null): RecoverySignal | null {
  if (!requestOrigin || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.domain !== "string" || typeof input.pageUrl !== "string" || input.pageUrl.length > 4096
      || input.domain.length > 253 || input.referrer !== undefined && (typeof input.referrer !== "string" || input.referrer.length > 2048)) return null;
  try {
    const domain = normalizeDashboardDomain(input.domain);
    const page = new URL(input.pageUrl);
    const origin = new URL(requestOrigin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.port
        || page.protocol !== "https:" || page.username || page.password || page.port
        || page.hostname.toLowerCase() !== domain || origin.hostname.toLowerCase() !== domain
        || origin.origin !== requestOrigin || page.origin !== origin.origin || page.hash) return null;
    const normalized = normalizeRecoveryUrl(page.href);
    let referrerHost: string | null = null;
    if (typeof input.referrer === "string" && input.referrer) {
      try {
        const referrer = new URL(input.referrer);
        if (["http:", "https:"].includes(referrer.protocol) && !referrer.username && !referrer.password
            && referrer.hostname.toLowerCase() !== domain) referrerHost = referrer.hostname.toLowerCase().replace(/\.$/, "");
      } catch { return null; }
    }
    return { domain, normalizedPath: normalized.normalized_path, referrerHost, origin: origin.origin };
  } catch { return null; }
}
