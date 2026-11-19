import { createServerDatabase } from "@/lib/supabase-server";
import { teaserRateLimitKey } from "@/lib/forensic-teaser";
import { normalizeFreeAuditUrl, runFreeProvenanceAudit } from "@/lib/free-provenance-audit";
import { readRequestJson } from "@/lib/read-request-json";

export const maxDuration = 30;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin submissions are not allowed." }, 403);
  const parsed = await readRequestJson(request, 4096);
  if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return json({ error: "Send a page URL." }, parsed.kind === "too_large" ? 413 : 400);
  const input = parsed.value as Record<string, unknown>;
  let url: string;
  try { url = normalizeFreeAuditUrl(input.url); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid page URL." }, 400); }
  const action = input.action === "lead" ? "lead" : input.action === "scan" ? "scan" : null;
  if (!action) return json({ error: "Choose scan or lead submission." }, 400);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (action === "lead" && (email.length > 320 || !EMAIL.test(email))) return json({ error: "Enter a valid email address." }, 400);
  try {
    const db = createServerDatabase();
    const key = teaserRateLimitKey(request, action === "scan" ? "provenance_scan" : "provenance_lead");
    const limit = await db.rpc("consume_forensic_teaser_rate_limit", { p_key_id: key, p_limit: action === "scan" ? 3 : 2 });
    if (limit.error) throw limit.error;
    if (!limit.data) return json({ error: "The free auditor limit has been reached. Try again shortly." }, 429);
    if (action === "scan") return json(await runFreeProvenanceAudit(url));
    const saved = await db.from("free_provenance_leads").insert({ domain: new URL(url).hostname.toLowerCase(), page_url: url, contact_email: email });
    if (saved.error) throw saved.error;
    return json({ received: true }, 201);
  } catch { return json({ error: "The free auditor is temporarily unavailable. Please retry later." }, 503); }
}
