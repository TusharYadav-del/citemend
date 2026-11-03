import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { routingPair } from "@/lib/edge-redirect-rule";
import { readRequestJson } from "@/lib/read-request-json";
import { hasProSubscription } from "@/lib/subscription";
import { decryptShopifyAccessToken } from "@/lib/shopify";
import { exportSyncRules, pushShopifyRedirect, type SyncFormat, type SyncRule } from "@/lib/redirect-sync";

export const maxDuration = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats: SyncFormat[] = ["vercel", "nextjs", "cloudflare", "nginx", "shopify"];
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

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
    let linksQuery = db.from("broken_links").select("id,cited_url,suggested_redirect,http_status").in("audit_id", audits.data.map(audit => audit.id)).eq("http_status", 404).not("suggested_redirect", "is", null).order("created_at", { ascending: false }).limit(500);
    if (typeof input.linkId === "string") linksQuery = linksQuery.eq("id", input.linkId);
    const links = await linksQuery;
    if (links.error) throw links.error;
    const byPath = new Map<string, SyncRule>();
    for (const link of links.data ?? []) {
      if (!link.suggested_redirect) continue;
      const pair = routingPair(link.cited_url, link.suggested_redirect, domain);
      if (pair && !byPath.has(pair.source_path)) byPath.set(pair.source_path, { id: link.id, source: pair.source_path, destination: pair.destination });
    }
    const rules = [...byPath.values()];
    if (!rules.length) return json({ error: "No verified redirect suggestions were found." }, 404);
    if (input.action === "export") return json({ content: exportSyncRules(input.format as SyncFormat, rules), count: rules.length });
    if (rules.length > 50) return json({ error: "Select an audit with at most 50 redirects for a Shopify sync." }, 400);
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
        if (prior.data?.synced_to_cms && prior.data.target_url === rule.destination) { results.push({ id: rule.id, status: "synced" }); continue; }
        if (prior.data?.synced_to_cms) { results.push({ id: rule.id, status: "failed", message: "A different destination is already synced; review it in Shopify." }); continue; }
        await pushShopifyRedirect(connection.data.shopify_store_domain, token, rule);
        const payload = { user_id: userId, source_link_id: rule.id, source_host: domain, source_path: rule.source, destination: rule.destination, domain, target_url: rule.destination, active: true, is_active: true, synced_to_cms: true };
        const saved = prior.data ? await db.from("redirect_rules").update(payload).eq("id", prior.data.id).eq("user_id", userId) : await db.from("redirect_rules").insert(payload);
        if (saved.error) { results.push({ id: rule.id, status: "review", message: "Created in Shopify; verify the rule before retrying because its status could not be saved." }); continue; }
        results.push({ id: rule.id, status: "synced" });
      } catch { results.push({ id: rule.id, status: "failed", message: "Shopify could not create this redirect. Check the store connection and existing redirects." }); }
    }
    return json({ results });
  } catch { return json({ error: "Redirect sync is temporarily unavailable." }, 503); }
}
