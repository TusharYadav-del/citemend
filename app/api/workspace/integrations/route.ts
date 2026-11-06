import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { readRequestJson } from "@/lib/read-request-json";
import { webhookProvider } from "@/lib/webhook-notify";
import { sendWorkspaceWebhook } from "@/lib/alerts";
import { encryptShopifyAccessToken } from "@/lib/shopify";
import { canWorkspace } from "@/lib/rbac";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) return json({ error: "Sign in to manage integrations." }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not allowed." }, 403);
  const body = await readRequestJson(request, 12_288);
  if (body.kind !== "ok" || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) return json({ error: "Provide valid integration settings." }, 400);
  const input = body.value as Record<string, unknown>;
  if (typeof input.domain !== "string" || !["status", "save", "test"].includes(String(input.action))) return json({ error: "Provide a domain and action." }, 400);
  let domain: string;
  try { domain = normalizeDashboardDomain(input.domain); } catch { return json({ error: "Provide a valid domain." }, 400); }
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, userId, orgId ?? null, orgRole);
    if (!canWorkspace(access.role, "manage_integrations")) return json({ error: "Workspace administrator access is required." }, 403);
    const ownerId = access.ownerUserIds[0];
    const owned = await db.from("audits").select("id").eq("user_id", ownerId).eq("domain", domain).limit(1).maybeSingle();
    if (owned.error) throw owned.error;
    if (!owned.data) return json({ error: "This domain is not associated with your account." }, 404);
    const current = await db.from("workspace_integrations").select("slack_webhook_url,discord_webhook_url,shopify_store_domain,shopify_admin_token").eq("user_id", ownerId).eq("domain", domain).maybeSingle();
    if (current.error) throw current.error;
    if (input.action === "test") {
      if (input.provider !== "slack" && input.provider !== "discord") return json({ error: "Select Slack or Discord." }, 400);
      const url = input.provider === "slack" ? current.data?.slack_webhook_url : current.data?.discord_webhook_url;
      if (!url) return json({ error: "Save this webhook before sending a test." }, 409);
      await sendWorkspaceWebhook(url, { kind: "test", domain });
      return json({ ok: true });
    }
    if (input.action === "save") {
      const updates: { user_id: string; domain: string; slack_webhook_url?: string | null; discord_webhook_url?: string | null; shopify_store_domain?: string | null; shopify_admin_token?: string | null; updated_at: string } = { user_id: ownerId, domain, updated_at: new Date().toISOString() };
      for (const [field, provider] of [["slack_webhook_url", "slack"], ["discord_webhook_url", "discord"]] as const) {
        const value = input[field];
        if (value === undefined) continue;
        if (typeof value !== "string" || (value.trim() && webhookProvider(value.trim()) !== provider)) return json({ error: `Provide a valid ${provider} webhook URL.` }, 400);
        updates[field] = value.trim() || null;
      }
      if (input.shopify_store_domain !== undefined) {
        if (typeof input.shopify_store_domain !== "string" || (input.shopify_store_domain.trim() && !/^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/.test(input.shopify_store_domain.trim().toLowerCase()))) return json({ error: "Provide a myshopify.com store domain." }, 400);
        updates.shopify_store_domain = input.shopify_store_domain.trim().toLowerCase() || null;
      }
      if (input.shopify_admin_token !== undefined) {
        if (typeof input.shopify_admin_token !== "string") return json({ error: "Provide a valid Shopify token." }, 400);
        updates.shopify_admin_token = input.shopify_admin_token ? encryptShopifyAccessToken(input.shopify_admin_token) : null;
      }
      const saved = await db.from("workspace_integrations").upsert(updates, { onConflict: "user_id,domain" });
      if (saved.error) throw saved.error;
      return json({ ok: true });
    }
    return json({ slackConfigured: !!current.data?.slack_webhook_url, discordConfigured: !!current.data?.discord_webhook_url, shopifyConfigured: !!(current.data?.shopify_store_domain && current.data.shopify_admin_token), shopifyStore: current.data?.shopify_store_domain ?? "" });
  } catch { return json({ error: "Integration settings are unavailable. Check the database and Shopify encryption configuration." }, 503); }
}
