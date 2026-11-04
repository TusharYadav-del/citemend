import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { routingPair } from "@/lib/edge-redirect-rule";
import { readRequestJson } from "@/lib/read-request-json";
import { hasProSubscription } from "@/lib/subscription";
import { decryptShopifyAccessToken } from "@/lib/shopify";
import { exportSyncRules, pushShopifyRedirect, type SyncFormat, type SyncRule } from "@/lib/redirect-sync";
import { canDeployApproved, verifyRedirectDestinations } from "@/lib/recovery-policy";
import { tracePublicRedirects, verifyUrl } from "@/lib/seo";

export const maxDuration = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats: SyncFormat[] = ["vercel", "nextjs", "cloudflare", "nginx", "shopify"];
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (cursor < items.length) { const index = cursor++; results[index] = await work(items[index]); } }));
  return results;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return json({ error: "Sign in to sync redirects." }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not allowed." }, 403);
  const body = await readRequestJson(request, 4096);
  if (body.kind !== "ok" || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) return json({ error: "Provide valid redirect sync settings." }, 400);
  const input = body.value as Record<string, unknown>;
  if (typeof input.domain !== "string" || typeof input.format !== "string" || !formats.includes(input.format as SyncFormat) || (input.auditId !== undefined && (typeof input.auditId !== "string" || !uuid.test(input.auditId))) || (input.linkId !== undefined && (typeof input.linkId !== "string" || !uuid.test(input.linkId))) || (input.action !== "export" && input.action !== "sync")) return json({ error: "Provide a domain, format, and valid audit or link ID." }, 400);
  if (input.action === "sync" && input.format !== "shopify") return json({ error: "Live sync is available for Shopify. Download the deployment file for this platform." }, 400);
  let domain: string;
  try { domain = normalizeDashboardDomain(input.domain); } catch { return json({ error: "Provide a valid domain." }, 400); }
  try {
    if (!await hasProSubscription(userId)) return json({ error: "Upgrade to Pro to export or publish redirects.", code: "PRO_REQUIRED" }, 403);
    const db = createServerDatabase();
    let auditsQuery = db.from("audits").select("id").eq("user_id", userId).eq("domain", domain).in("status", ["completed", "partial"]).order("created_at", { ascending: false }).limit(100);
    if (typeof input.auditId === "string") auditsQuery = auditsQuery.eq("id", input.auditId);
    const audits = await auditsQuery;
    if (audits.error) throw audits.error;
    if (!audits.data?.length) return json({ error: "No owned audit was found for this domain." }, 404);
    let linksQuery = db.from("broken_links").select("id,cited_url,suggested_redirect,http_status,approval_status,url_state,match_confidence").in("audit_id", audits.data.map(audit => audit.id)).eq("http_status", 404).eq("url_state", "404").in("approval_status", ["approved", "deployed"]).not("suggested_redirect", "is", null).order("created_at", { ascending: false }).limit(500);
    if (typeof input.linkId === "string") linksQuery = linksQuery.eq("id", input.linkId);
    const links = await linksQuery;
    if (links.error) throw links.error;
    const byPath = new Map<string, SyncRule & { sourceUrl: string }>();
    const conflictingCandidatePaths = new Set<string>();
    const conflictingCandidates: (SyncRule & { sourceUrl: string })[] = [];
    for (const link of links.data ?? []) {
        if (!link.suggested_redirect || !canDeployApproved({ urlState: link.url_state, httpStatus: link.http_status, approvalStatus: link.approval_status, similarityPercent: link.match_confidence })) continue;
      const pair = routingPair(link.cited_url, link.suggested_redirect, domain);
      if (pair) {
        const rule = { id: link.id, source: pair.source_path, sourceUrl: link.cited_url, destination: pair.destination };
        const existing = byPath.get(pair.source_path);
        if (existing && existing.destination !== rule.destination) { conflictingCandidatePaths.add(pair.source_path); conflictingCandidates.push(existing, rule); }
        else if (!existing) byPath.set(pair.source_path, rule);
      }
    }
    for (const rule of conflictingCandidates) {
      const logged = await db.from("action_audit_logs").insert({ workspace_domain: domain, actor_user_id: userId, action_type: "redirect_conflict_rejection", target_url: rule.destination, previous_state_json: { source_path: rule.source }, new_state_json: { reason: "Multiple approved mappings have different destinations for the same source path.", action: input.action }, safety_check_passed: false });
      if (logged.error) throw logged.error;
    }
    const approvedRules = [...byPath.values()].filter(rule => !conflictingCandidatePaths.has(rule.source));
    if (!approvedRules.length) return json({ error: "No approved redirect suggestions were found." }, 404);
    if (input.action === "sync" && approvedRules.length > 50) return json({ error: "Select an audit with at most 50 redirects for a Shopify sync." }, 400);
    const checkedRules = await mapLimited(approvedRules, 5, async rule => {
      try {
        const [source, chain] = await Promise.all([verifyUrl(rule.sourceUrl), tracePublicRedirects(rule.destination)]);
        const sourceUrl = new URL(rule.sourceUrl);
        const returnsToSource = chain.visitedUrls.some(value => { try { const url = new URL(value); return url.origin === sourceUrl.origin && url.pathname.replace(/\/$/, "") === sourceUrl.pathname.replace(/\/$/, ""); } catch { return false; } });
        if (chain.visitedUrls.some(value => { try { return new URL(value).hostname !== domain; } catch { return true; } })) return { rule, reason: "Destination redirect chain leaves the verified canonical domain." };
        if (source.state !== "404" || source.httpStatus !== 404) return { rule, reason: "Source is no longer a verified HTTP 404." };
        if (chain.status !== 200) return { rule, reason: "Destination redirect chain does not resolve to HTTP 200." };
        if (returnsToSource) return { rule, reason: "Destination redirect chain loops back to the source." };
        const prior = await db.from("redirect_rules").select("id,user_id,source_link_id,target_url,destination").eq("source_host", domain).eq("source_path", rule.source).eq("active", true).eq("is_active", true).limit(10);
        if (prior.error) throw prior.error;
        const conflict = (prior.data ?? []).find(saved => saved.user_id !== userId || saved.target_url !== rule.destination && saved.destination !== rule.destination);
        if (conflict) return { rule, reason: "An active redirect already conflicts with this source." };
        return { rule, reason: null as string | null };
      } catch { return { rule, reason: "Live safety checks could not verify this redirect." }; }
    });
    const safeRules = checkedRules.filter(item => item.reason === null).map(item => item.rule);
    const unsafeCount = conflictingCandidates.length + checkedRules.filter(item => item.reason !== null).length;
    for (const { rule, reason } of checkedRules.filter(item => item.reason !== null)) {
      const logged = await db.from("action_audit_logs").insert({ workspace_domain: domain, actor_user_id: userId, action_type: "redirect_conflict_rejection", target_url: rule.destination, previous_state_json: { source_path: rule.source }, new_state_json: { reason, action: input.action }, safety_check_passed: false });
      if (logged.error) throw logged.error;
    }
    const { live: rules, skipped } = await verifyRedirectDestinations(safeRules, verifyUrl);
    if (!rules.length) return json({ error: "No approved destination currently returns HTTP 200." }, 409);
    if (input.action === "export") {
      const skippedCount = unsafeCount + skipped.length;
      const exported = await db.from("action_audit_logs").insert({ workspace_domain: domain, actor_user_id: userId, action_type: "data_export", target_url: null, previous_state_json: null, new_state_json: { format: input.format, rule_count: rules.length, skipped_not_live: skippedCount }, safety_check_passed: skippedCount === 0 });
      if (exported.error) throw exported.error;
      return json({ content: exportSyncRules(input.format as SyncFormat, rules), count: rules.length, skippedNotLive: skippedCount });
    }
    if (unsafeCount || skipped.length) return json({ error: "One or more approved redirects failed live safety verification. Review them before syncing.", unavailableCount: unsafeCount + skipped.length }, 409);
    const connection = await db.from("workspace_integrations").select("shopify_store_domain,shopify_admin_token").eq("user_id", userId).eq("domain", domain).maybeSingle();
    if (connection.error) throw connection.error;
    if (!connection.data?.shopify_store_domain || !connection.data.shopify_admin_token) return json({ error: "Add Shopify credentials in workspace settings before syncing." }, 409);
    const token = connection.data.shopify_admin_token.startsWith("v1.") ? decryptShopifyAccessToken(connection.data.shopify_admin_token) : connection.data.shopify_admin_token;
    const results: { id: string; status: string; message?: string }[] = [];
    for (const rule of rules) {
      try {
        const prior = await db.from("redirect_rules").select("id,user_id,synced_to_cms,target_url").eq("domain", domain).eq("source_path", rule.source).maybeSingle();
        if (prior.error) throw prior.error;
        if (prior.data && prior.data.user_id !== userId) { results.push({ id: rule.id, status: "failed", message: "This path is managed by another account." }); continue; }
        if (prior.data?.synced_to_cms && prior.data.target_url === rule.destination) {
          const marked = await db.from("broken_links").update({ approval_status: "deployed", deployed_at: new Date().toISOString() }).eq("id", rule.id);
          if (marked.error) throw marked.error;
          const deploymentLog = await db.from("action_audit_logs").insert({ workspace_domain: domain, actor_user_id: userId, action_type: "redirect_deployment", target_url: rule.destination, previous_state_json: { synced_to_cms: true }, new_state_json: { synced_to_cms: true, idempotent_confirmation: true, source_path: rule.source }, safety_check_passed: true });
          if (deploymentLog.error) throw deploymentLog.error;
          results.push({ id: rule.id, status: "synced" }); continue;
        }
        if (prior.data?.synced_to_cms) {
          const conflictLog = await db.from("action_audit_logs").insert({ workspace_domain: domain, actor_user_id: userId, action_type: "redirect_conflict_rejection", target_url: rule.destination, previous_state_json: { synced_to_cms: true, target_url: prior.data.target_url }, new_state_json: { source_path: rule.source, reason: "A different redirect is already synced in Shopify." }, safety_check_passed: false });
          if (conflictLog.error) throw conflictLog.error;
          results.push({ id: rule.id, status: "failed", message: "A different destination is already synced; review it in Shopify." }); continue;
        }
        const shopifyRedirectId = await pushShopifyRedirect(connection.data.shopify_store_domain, token, rule);
        const payload = { user_id: userId, source_link_id: rule.id, source_host: domain, source_path: rule.source, destination: rule.destination, domain, target_url: rule.destination, active: true, is_active: true, synced_to_cms: true, shopify_redirect_id: shopifyRedirectId };
        const saved = prior.data ? await db.from("redirect_rules").update(payload).eq("id", prior.data.id).eq("user_id", userId) : await db.from("redirect_rules").insert(payload);
        if (saved.error) { results.push({ id: rule.id, status: "review", message: "Created in Shopify; verify the rule before retrying because its status could not be saved." }); continue; }
        const markedDeployed = await db.from("broken_links").update({ approval_status: "deployed", deployed_at: new Date().toISOString() }).eq("id", rule.id);
        if (markedDeployed.error) { results.push({ id: rule.id, status: "review", message: "Created in Shopify, but deployment status could not be saved. Check the destination before retrying." }); continue; }
        const deploymentLog = await db.from("action_audit_logs").insert({ workspace_domain: domain, actor_user_id: userId, action_type: "redirect_deployment", target_url: rule.destination, previous_state_json: { synced_to_cms: false }, new_state_json: { synced_to_cms: true, shopify_redirect_id: shopifyRedirectId, source_path: rule.source }, safety_check_passed: true });
        if (deploymentLog.error) { results.push({ id: rule.id, status: "review", message: "Created in Shopify, but the audit event could not be saved. Verify deployment before retrying." }); continue; }
        results.push({ id: rule.id, status: "synced" });
      } catch { results.push({ id: rule.id, status: "failed", message: "Shopify could not create this redirect. Check the store connection and existing redirects." }); }
    }
    return json({ results });
  } catch { return json({ error: "Redirect sync is temporarily unavailable." }, 503); }
}
