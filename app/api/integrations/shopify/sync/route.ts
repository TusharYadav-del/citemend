import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { createShopifyRedirect, decryptShopifyAccessToken } from "@/lib/shopify";

export const maxDuration = 60;

const privateHeaders = { "Cache-Control": "private, no-store" };
const MAX_RULES_PER_REQUEST = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RedirectRule = { id: string; source_path: string; target_url: string; is_active: boolean; synced_to_cms: boolean };
type SyncResult = { ruleId: string; sourcePath: string; status: "synced" | "already_synced" | "skipped_inactive" | "failed" | "created_needs_review"; message?: string };

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

async function readInput(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")
      || Number(request.headers.get("content-length") ?? 0) > 16_384) return null;
  try {
    const body = await request.text();
    if (body.length > 16_384) return null;
    const input: unknown = JSON.parse(body);
    return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to sync Shopify redirects." }, { status: 401, headers: privateHeaders });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin Shopify sync requests are not allowed." }, { status: 403, headers: privateHeaders });

  const input = await readInput(request);
  if (!input || typeof input.domain !== "string" || !Array.isArray(input.redirectRuleIds)
      || input.redirectRuleIds.length < 1 || input.redirectRuleIds.length > MAX_RULES_PER_REQUEST
      || !input.redirectRuleIds.every(id => typeof id === "string" && UUID.test(id))) {
    return Response.json({ error: `Provide between 1 and ${MAX_RULES_PER_REQUEST} valid redirect rule IDs.` }, { status: 400, headers: privateHeaders });
  }
  let domain: string;
  try { domain = normalizeDashboardDomain(input.domain); }
  catch { return Response.json({ error: "Provide a valid domain." }, { status: 400, headers: privateHeaders }); }
  const ids = [...new Set(input.redirectRuleIds as string[])];

  try {
    const db = createServerDatabase();
    const { data: connection, error: connectionError } = await db.from("cms_connections")
      .select("shop_subdomain,access_token")
      .eq("user_id", userId).eq("domain", domain).eq("platform", "shopify").maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection?.shop_subdomain || !connection.access_token) {
      return Response.json({ error: "Connect a Shopify store before syncing redirects." }, { status: 409, headers: privateHeaders });
    }

    const { data: rules, error: rulesError } = await db.from("redirect_rules")
      .select("id,source_path,target_url,is_active,synced_to_cms")
      .eq("user_id", userId).eq("domain", domain).in("id", ids);
    if (rulesError) throw rulesError;
    if (!rules || rules.length !== ids.length) return Response.json({ error: "One or more redirect rules do not belong to this account and domain." }, { status: 404, headers: privateHeaders });

    let accessToken: string;
    try { accessToken = decryptShopifyAccessToken(connection.access_token); }
    catch { return Response.json({ error: "The saved Shopify credential could not be decrypted. Reconnect the store with the configured encryption key." }, { status: 503, headers: privateHeaders }); }

    const results: SyncResult[] = [];
    for (const rule of rules as RedirectRule[]) {
      if (rule.synced_to_cms) {
        results.push({ ruleId: rule.id, sourcePath: rule.source_path, status: "already_synced" });
        continue;
      }
      if (!rule.is_active) {
        results.push({ ruleId: rule.id, sourcePath: rule.source_path, status: "skipped_inactive", message: "Enable this approved redirect before syncing." });
        continue;
      }

      try {
        const target = new URL(rule.target_url);
        if (target.protocol !== "https:" || target.hostname.toLowerCase() !== domain || target.username || target.password || target.port) {
          throw new Error("Redirect destination must be HTTPS on the connected domain.");
        }
        const targetPath = `${target.pathname}${target.search}`;
        await createShopifyRedirect(connection.shop_subdomain, accessToken, rule.source_path, targetPath);
        const { data: updated, error: updateError } = await db.from("redirect_rules").update({ synced_to_cms: true })
          .eq("id", rule.id).eq("user_id", userId).eq("domain", domain).select("id").maybeSingle();
        if (updateError || !updated) {
          results.push({ ruleId: rule.id, sourcePath: rule.source_path, status: "created_needs_review", message: "Created in Shopify, but could not save its synced status. Check Shopify before retrying." });
        } else {
          results.push({ ruleId: rule.id, sourcePath: rule.source_path, status: "synced" });
        }
      } catch (cause) {
        results.push({ ruleId: rule.id, sourcePath: rule.source_path, status: "failed", message: cause instanceof Error ? cause.message : "Shopify rejected this redirect." });
      }
    }

    return Response.json({ results, syncedCount: results.filter(result => result.status === "synced").length }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Shopify redirects could not be synced. Confirm migrations 013 and 014 have been applied." }, { status: 503, headers: privateHeaders });
  }
}
