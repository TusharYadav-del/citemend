import "server-only";
import { createServerDatabase } from "./supabase-server";
import { normalizeDashboardDomain } from "./audit-dashboard";
import { checkUrlStatus } from "./seo";
import { readRequestJson } from "./read-request-json";
import { canAutoRedirect } from "./recovery-policy";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
export const interceptOptions = () => new Response(null, { status: 204, headers: cors });
type Input = { domain: string; brokenPath: string; referrer: string; userAgent: string; utmSource: string; force: boolean; simulation: boolean };
type Candidate = { url: string; score: number; userId?: string | null };
type Deps = {
  quota: (domain: string) => Promise<boolean>;
  cached: (domain: string, path: string) => Promise<Candidate | null>;
  check: (url: string) => Promise<number>;
  log: (input: Input, target: Candidate, latency: number) => Promise<void>;
  authorizeSimulation: (domain: string) => Promise<boolean>;
  notify: (domain: string, source: string, brokenPath: string, targetUrl: string) => void;
};

function safeTarget(value: string, domain: string, path: string): string | null {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === domain && !url.port && !url.username && !url.password && !url.hash && url.pathname !== path ? url.href : null; } catch { return null; }
}
function aiSource(value: string): string {
  let host = value.trim().toLowerCase();
  const aliases: Record<string, string> = { chatgpt: "chatgpt.com", openai: "openai.com", perplexity: "perplexity.ai", claude: "claude.ai", gemini: "gemini.google.com", copilot: "copilot.microsoft.com" };
  if (aliases[host]) return aliases[host];
  try { host = new URL(host).hostname; } catch { host = host.replace(/^www\./, ""); }
  return /^(?:[a-z0-9-]+\.)*(?:chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/.test(host) ? host : "";
}
function parse(value: unknown): Input | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.domain !== "string" || typeof v.brokenPath !== "string" || v.domain.length > 253 || v.brokenPath.length > 2048 || !v.brokenPath.startsWith("/") || v.brokenPath.startsWith("//") || /[\\\u0000-\u001f\u007f?#]/.test(v.brokenPath)) return null;
  if ([v.referrer, v.userAgent, v.utmSource, v.utm_source].some(item => item !== undefined && (typeof item !== "string" || item.length > 2048))) return null;
  try {
    const domain = normalizeDashboardDomain(v.domain);
    const path = new URL(v.brokenPath, `https://${domain}`);
    if (path.pathname !== v.brokenPath || path.hostname !== domain) return null;
    return { domain, brokenPath: v.brokenPath, referrer: String(v.referrer ?? ""), userAgent: String(v.userAgent ?? "").slice(0, 1024), utmSource: String(v.utmSource ?? v.utm_source ?? ""), force: v.forceIntercept === true || v.forceIntercept === "true", simulation: v.simulation === true || v.simulation === "true" };
  } catch { return null; }
}

const defaults: Deps = {
  quota: async domain => {
    const { data, error } = await createServerDatabase().rpc("claim_pixel_intercept_quota", { target_domain: domain });
    if (error) throw error;
    return data === true;
  },
  cached: async (domain, path) => {
    const db = createServerDatabase();
    const { data: audits, error } = await db.from("audits").select("id,user_id").eq("domain", domain).not("user_id", "is", null).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    if (!audits?.length) return null;
    // Match the entire URL after restricting to this domain's audits.
    const { data: links, error: linkError } = await db.from("broken_links").select("audit_id,cited_url,suggested_redirect,approval_status,match_confidence,url_state").in("audit_id", audits.map(a => a.id)).eq("http_status", 404).eq("url_state", "404").in("approval_status", ["approved", "deployed"]).gte("match_confidence", 70).not("suggested_redirect", "is", null).limit(500);
    if (linkError) throw linkError;
    for (const audit of audits) {
      const link = links?.find(item => item.audit_id === audit.id && canAutoRedirect({ urlState: item.url_state, httpStatus: 404, approvalStatus: item.approval_status, similarityPercent: item.match_confidence }) && (() => { try { const url = new URL(item.cited_url); return url.hostname === domain && url.pathname === path; } catch { return false; } })());
      if (link?.suggested_redirect) return { url: link.suggested_redirect, score: 1, userId: audit.user_id };
    }
    return null;
  },
  check: checkUrlStatus,
  log: async (input, target, latency) => {
    const { error } = await createServerDatabase().from("rescued_ai_visits").insert({ user_id: target.userId ?? null, domain: input.domain, broken_path: input.brokenPath, rescued_target_url: target.url, ai_referrer: aiSource(input.referrer) || aiSource(input.utmSource) || "forced", similarity_score: target.score, latency_ms: latency, user_agent: input.userAgent });
    if (error) throw error;
  },
  authorizeSimulation: async domain => {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) return false;
    const { data, error } = await createServerDatabase().from("audits").select("id").eq("user_id", userId).eq("domain", domain).limit(1).maybeSingle();
    return !error && !!data;
  },
  notify: () => {},
};

export function createPixelInterceptHandler(overrides: Partial<Deps> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request) => {
    const started = performance.now();
    let raw: unknown;
    if (request.method === "GET") raw = Object.fromEntries(new URL(request.url).searchParams);
    else { const body = await readRequestJson(request, 8192); if (body.kind !== "ok") return reply({ error: "Invalid request body." }, body.kind === "too_large" ? 413 : 400); raw = body.value; }
    const input = parse(raw);
    if (!input) return reply({ error: "Provide a valid domain and broken path." }, 400);
    if (!input.force && !aiSource(input.referrer) && !aiSource(input.utmSource)) return reply({ rescued: false });
    try {
      if (input.simulation && !await deps.authorizeSimulation(input.domain)) return reply({ error: "Sign in to test an owned domain." }, 403);
      if (!await deps.quota(input.domain)) return reply({ rescued: false, error: "Rescue lookup is unavailable for this domain or is temporarily rate limited." }, 429);
      const cached = await deps.cached(input.domain, input.brokenPath);
      let target: Candidate | null = null;
      if (cached) {
        const candidate = cached;
          const url = safeTarget(candidate.url, input.domain, input.brokenPath);
          if (url && Number.isFinite(candidate.score) && candidate.score >= 0.7 && candidate.score <= 1) {
            const status = await deps.check(url).catch(() => 0);
            if (status === 200) target = { url, score: candidate.score };
          }
      }
      if (!target) return reply({ rescued: false, latencyMs: Math.round(performance.now() - started) });
      const latencyMs = Math.round(performance.now() - started);
      if (!input.simulation) await deps.log(input, target, latencyMs).catch(() => console.error("Rescue telemetry could not be saved."));
      const source = aiSource(input.referrer) || aiSource(input.utmSource);
      if (!input.simulation && source) { try { deps.notify(input.domain, source, input.brokenPath, target.url); } catch { /* A notification cannot block a rescue. */ } }
      return reply({ rescued: true, redirectTo: target.url, similarityScore: target.score, latencyMs });
    } catch { return reply({ error: "Rescue lookup is temporarily unavailable." }, 503); }
  };
}
