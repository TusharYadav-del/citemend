import "server-only";
import { runCitationProbe, type CitationProbeResult } from "./citation-probe";
import { extractTextUrls } from "./citation-urls";
import { checkUrlStatus, tracePublicRedirects } from "./seo";
import { publicFetch } from "./public-http";
import { createServerDatabase } from "./supabase-server";
import { readRequestJson } from "./read-request-json";
import { recordObservation } from "./evidence-engine";
import { assessTechnicalDeployment, observationCitesCanonical } from "./outcome-verifier";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE = { "Cache-Control": "private, no-store" };
type Dependencies = {
  getUserId?: () => Promise<string | null>;
  database?: typeof createServerDatabase;
  check?: typeof checkUrlStatus;
  probe?: typeof runCitationProbe;
  fetch?: typeof publicFetch;
  readJson?: typeof readRequestJson;
  trace?: typeof tracePublicRedirects;
  record?: typeof recordObservation;
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
  const probe = dependencies.probe ?? runCitationProbe;
  const fetcher = dependencies.fetch ?? publicFetch;
  const readJson = dependencies.readJson ?? readRequestJson;
  const trace = dependencies.trace ?? tracePublicRedirects;
  const record = dependencies.record ?? recordObservation;
  return async function handle(request: Request): Promise<Response> {
    let userId: string | null;
    try { userId = await getUserId(); } catch { return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503, headers: PRIVATE }); }
    if (!userId) return Response.json({ error: "Sign in to verify this fix." }, { status: 401, headers: PRIVATE });
    const parsed = await readJson(request, 4096);
    if (parsed.kind === "too_large") return Response.json({ error: "Request body exceeds 4 KiB." }, { status: 413, headers: PRIVATE });
    if (parsed.kind !== "ok") return Response.json({ error: "Send a valid JSON request." }, { status: 400, headers: PRIVATE });
    const body = parsed.value;
    if (!body || typeof body !== "object") return Response.json({ error: "Provide an auditId and brokenLinkId." }, { status: 400, headers: PRIVATE });
    const input = body as Record<string, unknown>;
    if (typeof input.auditId !== "string" || !UUID.test(input.auditId) || typeof input.brokenLinkId !== "string" || !UUID.test(input.brokenLinkId)) return Response.json({ error: "Provide valid audit and broken link IDs." }, { status: 400, headers: PRIVATE });
    if (input.indexNowKey !== undefined && !validIndexNowKey(input.indexNowKey)) return Response.json({ error: "IndexNow keys must be 8–128 letters, numbers, underscores, or hyphens." }, { status: 400, headers: PRIVATE });

    try {
      const db = database();
      const { data: link, error } = await db.from("broken_links")
        .select("id,audit_id,cited_url,suggested_redirect,approval_status,deployed_at,audits!inner(user_id,domain,buyer_prompt,indexnow_key)")
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

      const [sourceChain, destinationChain] = await Promise.all([trace(link.cited_url).catch(() => null), trace(target.href).catch(() => null)]);
      const sourceStatus = sourceChain?.status ?? null;
      const targetStatus = destinationChain?.status ?? null;
      const { data: activeRule, error: ruleError } = await db.from("redirect_rules").select("id,source_link_id,destination,target_url,active,is_active").eq("source_link_id", link.id).maybeSingle();
      if (ruleError) throw ruleError;
      const activeSameRule = !!activeRule && activeRule.source_link_id === link.id && activeRule.active === true && activeRule.is_active === true && (activeRule.destination === target.href || activeRule.target_url === target.href);
      const deployed = link.approval_status === "deployed" && !!link.deployed_at || activeSameRule;
      const chainSameHost = !!destinationChain && destinationChain.visitedUrls.every(url => { try { return [domain, `www.${domain}`].includes(new URL(url).hostname); } catch { return false; } });
      const sourceEndsAtDestination = !!sourceChain && sameUrl(sourceChain.finalUrl, target.href);
      const noLoops = !!sourceChain && sourceChain.visitedUrls.length <= 6 && new Set(sourceChain.visitedUrls).size === sourceChain.visitedUrls.length;
      const technicalDeploymentVerified = assessTechnicalDeployment({ approved: deployed, source404: sourceEndsAtDestination, destinationStatus: targetStatus, sameDomain: chainSameHost && [domain, `www.${domain}`].includes(target.hostname), noLoop: noLoops, noConflict: !activeRule || activeSameRule });
      const technicalVerifiedAt = technicalDeploymentVerified ? new Date().toISOString() : null;
      if (technicalDeploymentVerified) {
        const outcome = await db.from("recovery_outcomes").upsert({ audit_id: input.auditId, domain, broken_link_id: link.id, canonical_destination_url: target.href, technical_deployment_verified_at: technicalVerifiedAt }, { onConflict: "audit_id,broken_link_id,canonical_destination_url" }).select("id").single();
        if (outcome.error) throw outcome.error;
      }
      const indexNow = await pingIndexNow(domain, key, target.href, fetcher);
      let probeCitedLiveUrl = false;
      let probeWarning: string | null = null;
      try {
        const result: CitationProbeResult = await probe(domain, audit.buyer_prompt);
        const cited = [...new Set([...result.citedUrls, ...extractTextUrls(result.text)])];
        const evidence = await record({ audit_id: input.auditId, domain, prompt_query: audit.buyer_prompt, provider: result.providerUsed, model_name: "configured-citation-probe", search_method: "verify-fix-follow-up", locale: "en-US", raw_answer: result.text, extracted_urls: cited, job_status: "completed" });
        const observationAt = new Date().toISOString();
        probeCitedLiveUrl = technicalDeploymentVerified && observationCitesCanonical({ technicalVerified: true, observationAt, technicalVerifiedAt: technicalVerifiedAt!, extractedUrls: cited, canonicalUrl: target.href });
        if (technicalDeploymentVerified) {
          const updateOutcome = await db.from("recovery_outcomes").update({ evidence_id: evidence.id, ...(probeCitedLiveUrl ? { ai_citation_observed_at: observationAt } : {}) }).eq("audit_id", input.auditId).eq("broken_link_id", link.id).eq("canonical_destination_url", target.href);
          if (updateOutcome.error) throw updateOutcome.error;
        }
      } catch { probeWarning = "The AI citation re-check was unavailable; a successful HTTP check can still verify the redirect."; }
      const redirectResolves = technicalDeploymentVerified;
      const verified = technicalDeploymentVerified;
      if (probeCitedLiveUrl) {
        const { error: updateError } = await db.from("citation_hijack_opportunities").update({ verification_status: "verified_won", last_checked_at: new Date().toISOString() })
          .eq("audit_id", input.auditId).eq("matched_user_live_url", target.href);
        if (updateError && updateError.code !== "42P01") throw updateError;
      }
      return Response.json({
        verified,
        technical_deployment_verified: technicalDeploymentVerified,
        ai_citation_observed: probeCitedLiveUrl,
        milestones: { technicalDeploymentVerified, aiCitationObserved: probeCitedLiveUrl },
        badge: technicalDeploymentVerified ? "✅ Technical deployment verified" : null,
        http: { formerUrlStatus: sourceStatus, canonicalUrlStatus: targetStatus, redirectResolves },
        probeCitedLiveUrl, indexNow, indexNowNote: "IndexNow notifies participating search engines such as Bing; it does not force immediate LLM recrawls.", aiCitationNote: probeCitedLiveUrl ? "A subsequent recorded observation cited the canonical destination." : "No subsequent AI citation was observed in this probe. Technical deployment is reported separately.", ...(probeWarning ? { warning: probeWarning } : {}),
      }, { headers: PRIVATE });
    } catch {
      return Response.json({ error: "Fix verification is temporarily unavailable. Please retry." }, { status: 503, headers: PRIVATE });
    }
  };
}
