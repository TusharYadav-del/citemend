import "server-only";
import { runCitationProbe, type CitationProbeResult } from "./citation-probe";
import { extractTextUrls } from "./citation-urls";
import { checkUrlStatus } from "./seo";
import { publicFetch } from "./public-http";
import { createServerDatabase } from "./supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE = { "Cache-Control": "private, no-store" };
type Dependencies = {
  getUserId?: () => Promise<string | null>;
  database?: typeof createServerDatabase;
  check?: typeof checkUrlStatus;
  probe?: typeof runCitationProbe;
  fetch?: typeof publicFetch;
};

function sameUrl(left: string, right: string) {
  try {
    const a = new URL(left), b = new URL(right);
    a.hash = ""; b.hash = "";
    if (a.pathname !== "/") a.pathname = a.pathname.replace(/\/$/, "");
    if (b.pathname !== "/") b.pathname = b.pathname.replace(/\/$/, "");
    return a.hostname.toLowerCase() === b.hostname.toLowerCase() && a.pathname === b.pathname && a.search === b.search;
  } catch { return false; }
}

function validIndexNowKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(value);
}

async function readSmallText(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 512) { await response.body?.cancel(); return ""; }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512) { await reader.cancel(); return ""; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder().decode(Buffer.concat(chunks)).trim();
}

async function pingIndexNow(domain: string, key: string | null, canonicalUrl: string, fetcher: typeof publicFetch) {
  if (!key) return { status: "key_not_configured" as const };
  const keyLocation = `https://${domain}/${key}.txt`;
  try {
    const hostedKey = await fetcher(keyLocation, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "CiteMend/1.0" } });
    const keyText = hostedKey.ok ? await readSmallText(hostedKey) : (await hostedKey.body?.cancel(), "");
    if (!hostedKey.ok || keyText !== key) return { status: "key_file_missing" as const };
  } catch { return { status: "key_file_missing" as const }; }
  try {
    const response = await fetcher("https://api.indexnow.org/indexnow", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ host: domain, key, keyLocation, urlList: [canonicalUrl] }),
    });
    await response.body?.cancel();
    if (response.ok || response.status === 202) return { status: "submitted" as const };
    return { status: "rejected" as const, httpStatus: response.status };
  } catch { return { status: "unavailable" as const }; }
}

export function createVerifyFixHandler(dependencies: Dependencies = {}) {
  const getUserId = dependencies.getUserId ?? (async () => (await (await import("@clerk/nextjs/server")).auth()).userId);
  const database = dependencies.database ?? createServerDatabase;
  const check = dependencies.check ?? checkUrlStatus;
  const probe = dependencies.probe ?? runCitationProbe;
  const fetcher = dependencies.fetch ?? publicFetch;
  return async function handle(request: Request): Promise<Response> {
    let userId: string | null;
    try { userId = await getUserId(); } catch { return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503, headers: PRIVATE }); }
    if (!userId) return Response.json({ error: "Sign in to verify this fix." }, { status: 401, headers: PRIVATE });
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON request." }, { status: 400, headers: PRIVATE }); }
    if (!body || typeof body !== "object") return Response.json({ error: "Provide an auditId and brokenLinkId." }, { status: 400, headers: PRIVATE });
    const input = body as Record<string, unknown>;
    if (typeof input.auditId !== "string" || !UUID.test(input.auditId) || typeof input.brokenLinkId !== "string" || !UUID.test(input.brokenLinkId)) return Response.json({ error: "Provide valid audit and broken link IDs." }, { status: 400, headers: PRIVATE });
    if (input.indexNowKey !== undefined && !validIndexNowKey(input.indexNowKey)) return Response.json({ error: "IndexNow keys must be 8–128 letters, numbers, underscores, or hyphens." }, { status: 400, headers: PRIVATE });

    try {
      const db = database();
      const { data: link, error } = await db.from("broken_links")
        .select("id,audit_id,cited_url,suggested_redirect,audits!inner(user_id,domain,buyer_prompt,indexnow_key)")
        .eq("id", input.brokenLinkId).eq("audit_id", input.auditId).eq("audits.user_id", userId).maybeSingle();
      if (error) throw error;
      if (!link?.suggested_redirect) return Response.json({ error: "A verified same-domain redirect destination is required before re-verification." }, { status: 404, headers: PRIVATE });
      const audit = Array.isArray(link.audits) ? link.audits[0] : link.audits;
      if (!audit || !audit.buyer_prompt) return Response.json({ error: "The original buyer prompt is not available for this audit." }, { status: 409, headers: PRIVATE });
      const domain = audit.domain.toLowerCase();
      let target: URL;
      try { target = new URL(link.suggested_redirect); } catch { return Response.json({ error: "The saved redirect destination is invalid." }, { status: 409, headers: PRIVATE }); }
      if (target.protocol !== "https:" || !(target.hostname === domain || target.hostname === `www.${domain}`)) return Response.json({ error: "The redirect destination must use HTTPS on the audited domain." }, { status: 409, headers: PRIVATE });
      let key: string | null = typeof audit.indexnow_key === "string" && validIndexNowKey(audit.indexnow_key) ? audit.indexnow_key : null;
      if (typeof input.indexNowKey === "string") {
        key = input.indexNowKey;
        const { error: keyError } = await db.from("audits").update({ indexnow_key: key }).eq("id", input.auditId).eq("user_id", userId);
        if (keyError) throw keyError;
      }

      const [sourceStatus, targetStatus] = await Promise.all([
        check(link.cited_url).catch(() => null), check(target.href).catch(() => null),
      ]);
      const indexNow = await pingIndexNow(domain, key, target.href, fetcher);
      let probeCitedLiveUrl = false;
      let probeWarning: string | null = null;
      try {
        const result: CitationProbeResult = await probe(domain, audit.buyer_prompt);
        const cited = [...new Set([...result.citedUrls, ...extractTextUrls(result.text)])];
        probeCitedLiveUrl = cited.some(url => sameUrl(url, target.href));
      } catch { probeWarning = "The AI citation re-check was unavailable; a successful HTTP check can still verify the redirect."; }
      const redirectResolves = sourceStatus !== null && sourceStatus >= 200 && sourceStatus < 300;
      const verified = probeCitedLiveUrl || redirectResolves;
      if (verified) {
        const { error: updateError } = await db.from("citation_hijack_opportunities").update({ verification_status: "verified_won", last_checked_at: new Date().toISOString() })
          .eq("audit_id", input.auditId).eq("matched_user_live_url", target.href);
        if (updateError && updateError.code !== "42P01") throw updateError;
      }
      return Response.json({
        verified, badge: verified ? "✅ Verified Recovered in AI Search" : null,
        http: { formerUrlStatus: sourceStatus, canonicalUrlStatus: targetStatus, redirectResolves },
        probeCitedLiveUrl, indexNow, ...(probeWarning ? { warning: probeWarning } : {}),
      }, { headers: PRIVATE });
    } catch {
      return Response.json({ error: "Fix verification is temporarily unavailable. Please retry." }, { status: 503, headers: PRIVATE });
    }
  };
}
