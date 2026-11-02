import { createServerDatabase } from "@/lib/supabase-server";
import { generateUrlEmbedding, urlEmbeddingModel } from "@/lib/gemini";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { urlPathKeywords } from "@/lib/url-keywords";

export const maxDuration = 20;

const MAX_BODY_BYTES = 4096;
const MATCH_THRESHOLD = 0.78;

type ResolveInput = { domain: string; brokenPath: string; referrer: string; fullUrl: string };

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
  };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders() });
}

function parseReferrer(value: string): string {
  if (!value || value.length > 2048) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.hostname.toLowerCase().slice(0, 253) : "";
  } catch {
    return "";
  }
}

function validRequest(input: unknown): { input: ResolveInput; domain: string; fullUrl: URL } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.domain !== "string" || typeof value.brokenPath !== "string"
      || typeof value.referrer !== "string" || typeof value.fullUrl !== "string"
      || value.domain.length > 253 || value.brokenPath.length < 1 || value.brokenPath.length > 2048
      || value.referrer.length > 2048 || value.fullUrl.length > 4096) return null;

  try {
    const domain = normalizeDashboardDomain(value.domain);
    const fullUrl = new URL(value.fullUrl);
    if (!["http:", "https:"].includes(fullUrl.protocol) || fullUrl.username || fullUrl.password
        || fullUrl.port || fullUrl.hostname.toLowerCase() !== domain) return null;
    if (!value.brokenPath.startsWith("/") || value.brokenPath.startsWith("//") || value.brokenPath.includes("\\")
        || /[\u0000-\u001f\u007f]/.test(value.brokenPath)) return null;
    const pathUrl = new URL(value.brokenPath, `https://${domain}`);
    if (pathUrl.hostname !== domain || pathUrl.pathname !== value.brokenPath || pathUrl.search || pathUrl.hash
        || pathUrl.pathname.length > 2048 || fullUrl.pathname !== value.brokenPath) return null;
    return { input: value as ResolveInput, domain, fullUrl };
  } catch {
    return null;
  }
}

function safeTarget(value: string, domain: string, sourcePath: string): string | null {
  try {
    const target = new URL(value);
    if (target.protocol !== "https:" || target.hostname.toLowerCase() !== domain || target.port
        || target.username || target.password || target.hash || target.pathname === sourcePath) return null;
    return target.href;
  } catch {
    return null;
  }
}

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) throw new RangeError("body too large");
  if (!request.body) throw new SyntaxError("missing body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function recordEvent(
  db: ReturnType<typeof createServerDatabase>,
  input: ResolveInput,
  domain: string,
  redirectedTo: string | null,
  request: Request,
) {
  const { error } = await db.from("ai_404_events").insert({
    domain,
    broken_path: input.brokenPath,
    ai_referrer: parseReferrer(input.referrer),
    redirected_to: redirectedTo,
    user_agent: (request.headers.get("user-agent") ?? "").slice(0, 1024),
  });
  if (error) throw error;
}

async function incrementRecoveredHit(db: ReturnType<typeof createServerDatabase>, ruleId: string, initialCount: number) {
  let currentCount: number | null = initialCount;
  // Compare-and-swap prevents simultaneous visits from overwriting each other's count.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (currentCount === null) {
      const { data, error } = await db.from("redirect_rules").select("hits_recovered").eq("id", ruleId).maybeSingle();
      if (error) throw error;
      if (!data) return;
      currentCount = data.hits_recovered;
    }
    const { data, error } = await db.from("redirect_rules")
      .update({ hits_recovered: currentCount + 1 })
      .eq("id", ruleId).eq("is_active", true).eq("hits_recovered", currentCount)
      .select("id").maybeSingle();
    if (error) throw error;
    if (data) return;
    currentCount = null;
  }
  throw new Error("Could not increment the recovered-hit counter after concurrent updates.");
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await readJson(request);
  } catch (error) {
    return json({ error: error instanceof RangeError ? "Request body is too large." : "Provide a valid JSON request." }, error instanceof RangeError ? 413 : 400);
  }

  const validated = validRequest(input);
  if (!validated) return json({ error: "Provide a matching domain, broken path, referrer, and full URL." }, 400);
  const { domain, input: body, fullUrl } = validated;

  // Browser callers must be running on the reported customer domain.
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (!["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.hostname.toLowerCase() !== domain || parsedOrigin.port) {
        return json({ error: "The request origin does not match the supplied domain." }, 403);
      }
    } catch {
      return json({ error: "The request origin is invalid." }, 403);
    }
  }

  const db = (() => {
    try { return createServerDatabase(); } catch { return null; }
  })();
  if (!db) return json({ error: "Redirect resolution is temporarily unavailable." }, 503);

  try {
    const { data: rule, error: ruleError } = await db.from("redirect_rules")
      .select("id,target_url,hits_recovered")
      .eq("domain", domain).eq("source_path", body.brokenPath).eq("is_active", true).maybeSingle();
    if (ruleError) throw ruleError;

    if (rule) {
      const target = safeTarget(rule.target_url, domain, body.brokenPath);
      if (!target) {
        await recordEvent(db, body, domain, null, request);
        return json({ redirectUrl: null });
      }
      // The redirect is returned even if best-effort telemetry writes fail.
      await Promise.allSettled([
        incrementRecoveredHit(db, rule.id, rule.hits_recovered),
        recordEvent(db, body, domain, target, request),
      ]);
      return json({ redirectUrl: target });
    }

    const embedding = await generateUrlEmbedding(urlPathKeywords(fullUrl.href));
    const { data: matches, error: matchError } = await db.rpc("match_sitemap_url", {
      query_embedding: JSON.stringify(embedding),
      target_domain: domain,
      match_threshold: MATCH_THRESHOLD,
      match_count: 1,
      query_model: urlEmbeddingModel(),
    });
    if (matchError) throw matchError;

    const match = (matches ?? []).find(candidate => Number.isFinite(candidate.similarity)
      && candidate.similarity >= MATCH_THRESHOLD && candidate.similarity <= 1);
    const target = match ? safeTarget(match.url, domain, body.brokenPath) : null;
    if (!target) {
      await recordEvent(db, body, domain, null, request);
      return json({ redirectUrl: null });
    }

    // Keep automatically published rules attached to an existing account/domain record.
    const { data: audit, error: auditError } = await db.from("audits").select("user_id")
      .eq("domain", domain).not("user_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (auditError) throw auditError;
    if (!audit?.user_id) {
      await recordEvent(db, body, domain, null, request);
      return json({ redirectUrl: null });
    }

    const { data: created, error: insertError } = await db.from("redirect_rules").insert({
      user_id: audit.user_id,
      source_link_id: null,
      source_host: domain,
      source_path: body.brokenPath,
      destination: target,
      active: true,
      domain,
      target_url: target,
      confidence: match!.similarity,
      is_active: true,
      hits_recovered: 1,
    }).select("id,target_url,hits_recovered").single();

    if (insertError) {
      // A simultaneous first visit may have inserted the unique domain/path rule.
      const { data: concurrentRule, error: concurrentError } = await db.from("redirect_rules")
        .select("id,target_url,hits_recovered").eq("domain", domain).eq("source_path", body.brokenPath).eq("is_active", true).maybeSingle();
      if (concurrentError) throw concurrentError;
      const concurrentTarget = concurrentRule && safeTarget(concurrentRule.target_url, domain, body.brokenPath);
      if (!concurrentRule || !concurrentTarget) throw insertError;
      await Promise.allSettled([
        incrementRecoveredHit(db, concurrentRule.id, concurrentRule.hits_recovered),
        recordEvent(db, body, domain, concurrentTarget, request),
      ]);
      return json({ redirectUrl: concurrentTarget });
    }

    await recordEvent(db, body, domain, created.target_url, request);
    return json({ redirectUrl: target });
  } catch {
    await recordEvent(db, body, domain, null, request).catch(() => undefined);
    return json({ error: "Redirect resolution is temporarily unavailable." }, 503);
  }
}
