import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { routingPair } from "./edge-redirect-rule";
import { tracePublicRedirects, verifyUrl, type RedirectTrace } from "./seo";
import { createServerDatabase } from "./supabase-server";
import { readRequestJson } from "./read-request-json";
import { decryptShopifyAccessToken } from "./shopify";
import { deleteShopifyRedirect } from "./redirect-sync";

const PRIVATE = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Link = {
  id: string; audit_id: string; cited_url: string; http_status: number; url_state: string; suggested_redirect: string | null;
  approval_status: string; match_confidence: number | null; match_evidence_reason: string | null;
  previous_destination_url: string | null; audits: { user_id: string; domain: string } | { user_id: string; domain: string }[] | null;
};
type Dependencies = {
  getUserId: () => Promise<string | null>;
  database: typeof createServerDatabase;
  verify: typeof verifyUrl;
  trace: (url: string) => Promise<RedirectTrace>;
  deleteShopify: typeof deleteShopifyRedirect;
  previewSecret: () => string | null;
};

function relation(value: Link["audits"]) { return Array.isArray(value) ? value[0] : value; }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: PRIVATE }); }
async function logAction(db: ReturnType<typeof createServerDatabase>, entry: { workspace_domain: string; actor_user_id: string; action_type: string; target_url: string | null; previous_state_json: unknown; new_state_json: unknown; safety_check_passed: boolean }) {
  const result = await db.from("action_audit_logs").insert(entry);
  if (result.error) throw result.error;
}
function crossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin !== new URL(request.url).origin; } catch { return true; }
}
function previewSignature(payload: string, secret: string) { return createHmac("sha256", secret).update(payload).digest("base64url"); }
function makePreviewToken(secret: string, linkId: string, userId: string, destination: string) {
  const payload = Buffer.from(JSON.stringify({ linkId, userId, destination, expiresAt: Date.now() + 5 * 60_000 })).toString("base64url");
  return `${payload}.${previewSignature(payload, secret)}`;
}
function validPreviewToken(token: unknown, secret: string, linkId: string, userId: string, destination: string) {
  if (typeof token !== "string") return false;
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra || !/^[A-Za-z0-9_-]{20,2000}$/.test(payload)) return false;
  const expected = Buffer.from(previewSignature(payload, secret));
  const actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    return value.linkId === linkId && value.userId === userId && value.destination === destination
      && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) && value.expiresAt >= Date.now();
  } catch { return false; }
}
async function body(request: Request) {
  const parsed = await readRequestJson(request, 4096);
  if (parsed.kind === "too_large") return { error: json({ error: "Request body exceeds 4 KiB." }, 413) };
  if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return { error: json({ error: "Send a valid JSON request." }, 400) };
  return { value: parsed.value as Record<string, unknown> };
}

export function createRecoveryApproveHandler(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = {
    getUserId: overrides.getUserId ?? (async () => (await (await import("@clerk/nextjs/server")).auth()).userId),
    database: overrides.database ?? createServerDatabase,
    verify: overrides.verify ?? verifyUrl,
    trace: overrides.trace ?? (tracePublicRedirects as (url: string) => Promise<RedirectTrace>),
    deleteShopify: overrides.deleteShopify ?? deleteShopifyRedirect,
    previewSecret: overrides.previewSecret ?? (() => process.env.RECOVERY_PREVIEW_SECRET?.trim() || process.env.CLERK_SECRET_KEY?.trim() || null),
  };
  return async (request: Request) => {
    let userId: string | null;
    try { userId = await deps.getUserId(); } catch { return json({ error: "Authentication is temporarily unavailable." }, 503); }
    if (!userId) return json({ error: "Sign in to review this redirect." }, 401);
    if (crossOrigin(request)) return json({ error: "Cross-origin requests are not allowed." }, 403);
    const parsed = await body(request);
    if (parsed.error) return parsed.error;
    const { linkId, action, reviewConfirmed, previewToken, destinationUrl } = parsed.value!;
    if (typeof linkId !== "string" || !UUID.test(linkId) || (action !== "preview" && action !== "approve") || (reviewConfirmed !== undefined && typeof reviewConfirmed !== "boolean") || (previewToken !== undefined && typeof previewToken !== "string") || (destinationUrl !== undefined && (typeof destinationUrl !== "string" || destinationUrl.length > 2048))) return json({ error: "Provide a linkId and preview or approve action." }, 400);
    try {
      const db = deps.database();
      const { data, error } = await db.from("broken_links")
        .select("id,audit_id,cited_url,http_status,url_state,suggested_redirect,approval_status,match_confidence,match_evidence_reason,previous_destination_url,audits!inner(user_id,domain)")
        .eq("id", linkId).eq("audits.user_id", userId).maybeSingle();
      if (error) throw error;
      const link = data as unknown as Link | null;
      const audit = link && relation(link.audits);
      if (!link || !audit) return json({ error: "Broken link not found." }, 404);
      const recordRejection = (reason: string) => logAction(db, { workspace_domain: audit.domain, actor_user_id: userId, action_type: "redirect_conflict_rejection", target_url: link.suggested_redirect, previous_state_json: { url_state: link.url_state, approval_status: link.approval_status }, new_state_json: { reason, action }, safety_check_passed: false });
      if (link.http_status !== 404 || link.url_state !== "404") { await recordRejection("Only a currently verified 404 can be reviewed for recovery."); return json({ error: "Only a currently verified 404 can be reviewed for recovery." }, 409); }
      if (link.approval_status === "deployed" || link.approval_status === "rejected") { await recordRejection("This recovery is no longer awaiting approval."); return json({ error: "This recovery is no longer awaiting approval." }, 409); }
      const score = link.match_confidence;
      const suppliedDestination = typeof destinationUrl === "string" ? destinationUrl.trim() : null;
      if (!link.suggested_redirect && !suppliedDestination) { await recordRejection("No destination is available; provide a manual mapping."); return json({ error: "No destination is available. Enter a manual mapping and preview it.", code: "MANUAL_MAPPING_REQUIRED" }, 409); }
      if (score !== null && score < 70 && !suppliedDestination) { await recordRejection("Similarity below 0.70 requires a manual mapping."); return json({ error: "Similarity is below 0.70. Choose and preview a manual mapping; this low-score candidate is never auto-deployed.", code: "MANUAL_MAPPING_REQUIRED" }, 409); }
      if (score !== null && score > 100) { await recordRejection("The saved similarity score is invalid."); return json({ error: "The saved similarity score is invalid." }, 409); }
      const chosenDestination = suppliedDestination ?? link.suggested_redirect!;
      const manualMapping = suppliedDestination !== null && (score !== null && score < 70 || suppliedDestination !== link.suggested_redirect);
      const approvalScore = manualMapping ? null : score;
      const pair = routingPair(link.cited_url, chosenDestination, audit.domain);
      if (!pair) {
        await logAction(db, { workspace_domain: audit.domain, actor_user_id: userId, action_type: "redirect_conflict_rejection", target_url: chosenDestination, previous_state_json: { cited_url: link.cited_url }, new_state_json: { reason: "destination must use the verified canonical HTTPS domain and differ from its source" }, safety_check_passed: false });
        return json({ error: "The destination must be a distinct HTTPS URL on the verified canonical domain." }, 422);
      }
      const rejectSafety = async (reason: string, status = 409) => {
        await logAction(db, { workspace_domain: audit.domain, actor_user_id: userId, action_type: "redirect_conflict_rejection", target_url: pair.destination, previous_state_json: { cited_url: link.cited_url, approval_status: link.approval_status }, new_state_json: { reason }, safety_check_passed: false });
        return json({ error: reason }, status);
      };
      const source = await deps.verify(link.cited_url);
      if (source.state !== "404" || source.httpStatus !== 404) return await rejectSafety(source.state === "200" ? "The source now resolves to a live HTTP 200 page; overwriting its canonical content was stopped." : `The source no longer verifies as HTTP 404 (${source.state}); approval was stopped.`);
      let trace: RedirectTrace;
      try { trace = await deps.trace(pair.destination); }
      catch { return await rejectSafety("The destination redirect chain is unsafe, loops, or could not be verified.", 422); }
      const sourceUrl = new URL(link.cited_url);
      if (trace.visitedUrls.some(value => { try { return new URL(value).hostname !== pair.source_host; } catch { return true; } })) return await rejectSafety("The destination redirect chain leaves the verified canonical domain.", 422);
      const sameCanonicalUrl = (value: string) => { try { const url = new URL(value); return url.origin === sourceUrl.origin && url.pathname.replace(/\/$/, "") === sourceUrl.pathname.replace(/\/$/, ""); } catch { return false; } };
      if (trace.visitedUrls.some(sameCanonicalUrl)) return await rejectSafety("The destination redirects back to the broken source, creating a redirect loop.", 422);
      if (trace.status !== 200) return await rejectSafety("The destination must resolve to HTTP 200 after redirects.", 422);
      const conflicts = await db.from("redirect_rules").select("id,destination,target_url,source_link_id").eq("source_host", pair.source_host).eq("source_path", pair.source_path).eq("active", true).eq("is_active", true).limit(10);
      if (conflicts.error) throw conflicts.error;
      const conflictingRule = (conflicts.data ?? []).find(rule => rule.destination !== pair.destination && rule.target_url !== pair.destination);
      if (conflictingRule) return await rejectSafety("An active redirect already uses this source with a different destination.");
      if (action === "preview") {
        const secret = deps.previewSecret();
        if (!secret) {
          await logAction(db, { workspace_domain: audit.domain, actor_user_id: userId, action_type: "redirect_preview", target_url: pair.destination, previous_state_json: { approval_status: link.approval_status }, new_state_json: { error: "preview signing is not configured" }, safety_check_passed: false });
          return json({ error: "Recovery preview signing is not configured." }, 503);
        }
        await logAction(db, { workspace_domain: audit.domain, actor_user_id: userId, action_type: "redirect_preview", target_url: pair.destination, previous_state_json: { url_state: link.url_state, approval_status: link.approval_status }, new_state_json: { destination_status: trace.status, visited_urls: trace.visitedUrls, similarity_score: approvalScore }, safety_check_passed: true });
        return json({ preview: { destination: pair.destination, state: "200", httpStatus: trace.status, redirectChain: trace.visitedUrls, similarityScore: approvalScore === null ? null : approvalScore / 100, scoreMeaning: "ranking signal, not probability", manualMapping, requiresHumanReview: manualMapping || approvalScore === null || approvalScore < 85, previewToken: makePreviewToken(secret, link.id, userId, pair.destination) } });
      }
      if (manualMapping || approvalScore === null || approvalScore < 85) {
        const secret = deps.previewSecret();
        if (reviewConfirmed !== true || !secret || !validPreviewToken(previewToken, secret, link.id, userId, pair.destination)) {
          await logAction(db, { workspace_domain: audit.domain, actor_user_id: userId, action_type: "redirect_conflict_rejection", target_url: pair.destination, previous_state_json: { approval_status: link.approval_status }, new_state_json: { reason: "A current signed preview and explicit human confirmation are required." }, safety_check_passed: false });
          return json({ error: "Review the recent HTTP 200 preview for this link and explicitly confirm it.", code: "REVIEW_CONFIRMATION_REQUIRED" }, 409);
        }
      }

      const prior = await db.from("redirect_rules").select("id,destination,target_url").eq("source_link_id", link.id).eq("user_id", userId).maybeSingle();
      if (prior.error) throw prior.error;
      const oldDestination = prior.data?.target_url ?? prior.data?.destination ?? null;
      const update = await db.from("broken_links").update({ approval_status: "approved", approved_by: userId, approved_at: new Date().toISOString(), deployed_at: null, rolled_back_at: null, suggested_redirect: pair.destination, match_confidence: approvalScore, previous_destination_url: oldDestination && oldDestination !== pair.destination ? oldDestination : null, match_evidence_reason: manualMapping ? "Owner-provided manual mapping; similarity score is not applicable. Destination returned HTTP 200 and was explicitly approved." : `${link.match_evidence_reason ?? "Verified destination candidate."} Human approved after HTTP 200 preview.` }).eq("id", link.id).eq("audit_id", link.audit_id);
      if (update.error) throw update.error;
      await logAction(db, { workspace_domain: audit.domain, actor_user_id: userId, action_type: "redirect_approval", target_url: pair.destination, previous_state_json: { approval_status: link.approval_status, suggested_redirect: link.suggested_redirect }, new_state_json: { approval_status: "approved", similarity_score: approvalScore, safety_checks: ["canonical_domain", "redirect_loop", "active_conflict", "destination_http_200"] }, safety_check_passed: true });
      return json({ approved: true, destination: pair.destination, status: "approved" });
    } catch { return json({ error: "Recovery approval is temporarily unavailable." }, 503); }
  };
}

export function createRecoveryRollbackHandler(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = {
    getUserId: overrides.getUserId ?? (async () => (await (await import("@clerk/nextjs/server")).auth()).userId),
    database: overrides.database ?? createServerDatabase,
    verify: overrides.verify ?? verifyUrl,
    trace: overrides.trace ?? (tracePublicRedirects as (url: string) => Promise<RedirectTrace>),
    deleteShopify: overrides.deleteShopify ?? deleteShopifyRedirect,
    previewSecret: overrides.previewSecret ?? (() => process.env.RECOVERY_PREVIEW_SECRET?.trim() || process.env.CLERK_SECRET_KEY?.trim() || null),
  };
  return async (request: Request) => {
    let userId: string | null;
    try { userId = await deps.getUserId(); } catch { return json({ error: "Authentication is temporarily unavailable." }, 503); }
    if (!userId) return json({ error: "Sign in to roll back this redirect." }, 401);
    if (crossOrigin(request)) return json({ error: "Cross-origin requests are not allowed." }, 403);
    const parsed = await body(request);
    if (parsed.error) return parsed.error;
    const { linkId } = parsed.value!;
    if (typeof linkId !== "string" || !UUID.test(linkId)) return json({ error: "Provide a valid broken link ID." }, 400);
    try {
      const db = deps.database();
      const { data, error } = await db.from("broken_links")
        .select("id,audit_id,cited_url,http_status,url_state,suggested_redirect,approval_status,match_confidence,match_evidence_reason,previous_destination_url,audits!inner(user_id,domain)")
        .eq("id", linkId).eq("audits.user_id", userId).maybeSingle();
      if (error) throw error;
      const link = data as unknown as Link | null;
      const audit = link && relation(link.audits);
      if (!link || !audit) return json({ error: "Broken link not found." }, 404);
      const recordRollbackRejection = (reason: string) => logAction(db, { workspace_domain: audit.domain, actor_user_id: userId, action_type: "redirect_conflict_rejection", target_url: link.suggested_redirect, previous_state_json: { approval_status: link.approval_status }, new_state_json: { reason, action: "rollback" }, safety_check_passed: false });
      if (link.approval_status !== "approved" && link.approval_status !== "deployed") { await recordRollbackRejection("Only an approved or deployed redirect can be rolled back."); return json({ error: "Only an approved or deployed redirect can be rolled back." }, 409); }
      if (link.match_confidence !== null && link.match_confidence < 70) { await recordRollbackRejection("Low similarity candidates cannot be deployed or rolled back."); return json({ error: "Low similarity candidates cannot be deployed or rolled back." }, 409); }

      let previous: string | null = link.previous_destination_url;
      if (previous) {
        const valid = routingPair(link.cited_url, previous, audit.domain);
        if (!valid) { await recordRollbackRejection("The previous destination is no longer a valid same-domain mapping."); return json({ error: "The previous destination is no longer a valid same-domain mapping." }, 409); }
        const checked = await deps.verify(valid.destination);
        if (checked.state !== "200" || checked.httpStatus !== 200) { await recordRollbackRejection("The previous destination is not currently HTTP 200, so rollback was stopped."); return json({ error: "The previous destination is not currently HTTP 200, so rollback was stopped." }, 409); }
        previous = valid.destination;
      }
      const { data: rule, error: ruleError } = await db.from("redirect_rules").select("id,user_id,target_url,destination,active,is_active,synced_to_cms,shopify_redirect_id").eq("source_link_id", link.id).eq("user_id", userId).maybeSingle();
      if (ruleError) throw ruleError;
      if (rule?.synced_to_cms) {
        if (!rule.shopify_redirect_id) { await recordRollbackRejection("The Shopify redirect has no tracked remote ID."); return json({ error: "This Shopify redirect predates rollback tracking. Remove it in Shopify Admin before marking it rolled back." }, 409); }
        const integration = await db.from("workspace_integrations").select("shopify_store_domain,shopify_admin_token").eq("user_id", userId).eq("domain", audit.domain).maybeSingle();
        if (integration.error) throw integration.error;
        if (!integration.data?.shopify_store_domain || !integration.data.shopify_admin_token) { await recordRollbackRejection("Shopify credentials are unavailable; rollback was not applied."); return json({ error: "Shopify credentials are unavailable; rollback was not applied." }, 409); }
        const token = integration.data.shopify_admin_token.startsWith("v1.") ? decryptShopifyAccessToken(integration.data.shopify_admin_token) : integration.data.shopify_admin_token;
        await deps.deleteShopify(integration.data.shopify_store_domain, token, rule.shopify_redirect_id);
      }
      if (rule) {
        const changed = previous
          ? await db.from("redirect_rules").update({ destination: previous, target_url: previous, active: true, is_active: true, synced_to_cms: false, shopify_redirect_id: null, updated_at: new Date().toISOString() }).eq("id", rule.id).eq("user_id", userId)
          : await db.from("redirect_rules").update({ active: false, is_active: false, synced_to_cms: false, shopify_redirect_id: null, updated_at: new Date().toISOString() }).eq("id", rule.id).eq("user_id", userId);
        if (changed.error) throw changed.error;
      }
      const updated = await db.from("broken_links").update({ approval_status: "rolled_back", rolled_back_at: new Date().toISOString(), ...(previous ? { suggested_redirect: previous } : {}) }).eq("id", link.id).eq("audit_id", link.audit_id);
      if (updated.error) throw updated.error;
      await logAction(db, { workspace_domain: audit.domain, actor_user_id: userId, action_type: "redirect_rollback", target_url: link.suggested_redirect, previous_state_json: { approval_status: link.approval_status, destination: link.suggested_redirect }, new_state_json: { approval_status: "rolled_back", restored_destination: previous }, safety_check_passed: true });
      return json({ rolledBack: true, restoredDestination: previous, localRedirectActive: Boolean(previous) });
    } catch { return json({ error: "Recovery rollback is temporarily unavailable." }, 503); }
  };
}
