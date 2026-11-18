import { createServerDatabase } from "@/lib/supabase-server";
import { readRequestJson } from "@/lib/read-request-json";
import { parseRecoverySignal } from "@/lib/recovery/signals";

const json = (value: unknown, status = 200, origin?: string) => Response.json(value, {
  status,
  headers: { "Cache-Control": "no-store", ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}) },
});

export async function OPTIONS(request: Request) {
  const headerOrigin = request.headers.get("origin");
  let parsedOrigin = null;
  try {
    const origin = new URL(headerOrigin ?? "");
    parsedOrigin = parseRecoverySignal({ domain: origin.hostname, pageUrl: origin.href }, headerOrigin);
  } catch { /* Invalid origins receive no CORS permission. */ }
  if (!parsedOrigin) return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": parsedOrigin.origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  } });
}

export async function POST(request: Request) {
  const body = await readRequestJson(request, 4096);
  if (body.kind !== "ok") return json({ error: body.kind === "too_large" ? "Request body is too large." : "Provide a valid JSON request." }, body.kind === "too_large" ? 413 : 400);
  const signal = parseRecoverySignal(body.value, request.headers.get("origin"));
  if (!signal) return json({ error: "A valid HTTPS site origin, domain, and page URL are required." }, 400);
  try {
    const { data, error } = await createServerDatabase().rpc("record_recovery_signal", {
      target_domain: signal.domain,
      target_path: signal.normalizedPath,
      target_referrer_host: signal.referrerHost,
      target_redirected_to: null,
      target_user_agent: "",
    });
    if (error) return json({ error: "Recovery event ingestion is temporarily unavailable." }, 503, signal.origin);
    const result = data as { accepted?: unknown; reason?: unknown } | null;
    if (result?.accepted !== true) {
      const status = result?.reason === "unknown_domain" ? 404 : result?.reason === "rate_limited_or_unknown_domain" ? 429 : 503;
      return json({ error: status === 404 ? "This domain needs a completed CiteMend audit before events can be collected." : status === 429 ? "Event collection is temporarily rate limited." : "Recovery event ingestion is unavailable." }, status, signal.origin);
    }
    return json({ accepted: true }, 202, signal.origin);
  } catch {
    return json({ error: "Recovery event ingestion is temporarily unavailable." }, 503, signal.origin);
  }
}
