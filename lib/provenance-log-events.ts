import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export type ProvenanceSource = "cloudflare_logpush" | "shopify_webhook" | "server_log";
export type ProvenanceEventInput = { type: "crawler_fetch" | "ai_referral" | "shopify_order"; url?: string; userAgent?: string; referrer?: string; verifiedBot?: boolean; clientIp?: string; sessionId?: string; orderId?: string; occurredAt?: string };
const CRAWLERS = [
  ["GPTBot", /\bGPTBot\b/i], ["PerplexityBot", /\bPerplexityBot\b/i], ["ClaudeBot", /\bClaudeBot\b/i], ["Google-Extended", /\bGoogle-Extended\b/i],
] as const;
const AI_REFERRER_HOSTS = ["chatgpt.com", "openai.com", "perplexity.ai", "gemini.google.com", "google.com", "claude.ai", "anthropic.com"];

export function parseCrawlerName(userAgent: string): string | null { return CRAWLERS.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? null; }
export function normalizeAiReferrer(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return AI_REFERRER_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`)) ? host : null;
  } catch { return null; }
}
export function normalizeEventPageUrl(value: string, domain: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const root = domain.toLowerCase().replace(/^www\./, "");
    if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.port || !(host === root || host.endsWith(`.${root}`))) return null;
    url.hash = "";
    return url.href.slice(0, 2048);
  } catch { return null; }
}
export function signProvenanceBody(rawBody: string, timestamp: string, secret: string): string { return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"); }
export function verifyProvenanceSignature(rawBody: string, timestamp: string, provided: string, secret: string, now = Date.now()): boolean {
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(now - seconds * 1000) > 5 * 60_000 || !/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = Buffer.from(signProvenanceBody(rawBody, timestamp, secret), "hex"), actual = Buffer.from(provided, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function stableJourneyHash(value: string | undefined, secret: string): string | null {
  if (!value || value.length > 256) return null;
  return createHmac("sha256", secret).update(`journey:${value}`).digest("hex");
}
export function stableOrderReferenceHash(value: string | undefined, secret: string): string | null {
  if (!value || value.length > 256) return null;
  return createHmac("sha256", secret).update(`order:${value}`).digest("hex");
}
export function validateProvenanceEvent(event: ProvenanceEventInput, domain: string, source: ProvenanceSource) {
  if (event.type === "crawler_fetch") {
    const crawlerName = typeof event.userAgent === "string" ? parseCrawlerName(event.userAgent.slice(0, 1024)) : null;
    const pageUrl = typeof event.url === "string" ? normalizeEventPageUrl(event.url, domain) : null;
    if (!crawlerName || !pageUrl) return null;
    const verifiedBot = source === "cloudflare_logpush" && event.verifiedBot === true;
    const ipValid = typeof event.clientIp === "string" && isIP(event.clientIp) !== 0;
    return { event_type: event.type, page_url: pageUrl, crawler_name: crawlerName, crawler_verified: verifiedBot && ipValid, referral_host: null };
  }
  if (event.type === "ai_referral") {
    const referralHost = typeof event.referrer === "string" ? normalizeAiReferrer(event.referrer) : null;
    if (!referralHost) return null;
    return { event_type: event.type, page_url: typeof event.url === "string" ? normalizeEventPageUrl(event.url, domain) : null, crawler_name: null, crawler_verified: false, referral_host: referralHost };
  }
  if (event.type === "shopify_order" && source === "shopify_webhook" && typeof event.orderId === "string" && event.orderId.length > 0 && event.orderId.length <= 256) {
    return { event_type: event.type, page_url: null, crawler_name: null, crawler_verified: false, referral_host: null };
  }
  return null;
}
export function validProvenanceTimestamp(value: string | undefined, now = Date.now()): string | null {
  const time = value ? Date.parse(value) : now;
  return Number.isFinite(time) && time <= now + 60_000 && time >= now - 30 * 86_400_000 ? new Date(time).toISOString() : null;
}
