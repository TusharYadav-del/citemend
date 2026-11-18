import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { decryptConnectedShopifyToken, deployShopifyUrlRedirect } from "@/lib/shopify/redirects";
import { verifyDeployedRedirect } from "@/lib/recovery/verify";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";

export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let userId: string | null;
  try { userId = (await auth()).userId; }
  catch { return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503, headers }); }
  if (!userId) return Response.json({ error: "Sign in to deploy redirects." }, { status: 401, headers });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403, headers });
  const input = await request.json().catch(() => null) as { domain?: unknown; findingId?: unknown } | null;
  if (!input || typeof input.domain !== "string" || typeof input.findingId !== "string" || !UUID.test(input.findingId)) return Response.json({ error: "Provide a valid domain and finding ID." }, { status: 400, headers });
  let domain: string;
  try { domain = normalizeDashboardDomain(input.domain); } catch { return Response.json({ error: "Provide a valid domain." }, { status: 400, headers }); }

  try {
    const db = createServerDatabase();
    const audit = await db.from("audits").select("id").eq("user_id", userId).eq("domain", domain).limit(500).order("created_at", { ascending: false });
    if (audit.error) throw audit.error;
    const auditIds = (audit.data ?? []).map(row => row.id);
    if (!auditIds.length) return Response.json({ error: "This domain is not associated with your account." }, { status: 404, headers });
    const findingResult = await db.from("recovery_findings").select("id,audit_id,domain,finding_type,normalized_path,guardrail_classification,approval_status,suggested_target_url,confidence_score,match_reason").eq("id", input.findingId).in("audit_id", auditIds).maybeSingle();
    if (findingResult.error) throw findingResult.error;
    const finding = findingResult.data;
    if (!finding) return Response.json({ error: "Recovery finding was not found in this workspace." }, { status: 404, headers });
    if (finding.finding_type !== "dead_url" || finding.approval_status !== "approved" || finding.guardrail_classification !== "recoverable_equivalent" || !finding.suggested_target_url) return Response.json({ error: "Only human-approved, recoverable dead URLs can be deployed." }, { status: 409, headers });
    if (finding.domain !== domain || !finding.normalized_path.startsWith("/") || finding.normalized_path.startsWith("//")) return Response.json({ error: "The approved finding has invalid source details." }, { status: 409, headers });
    const target = new URL(finding.suggested_target_url);
    if (target.protocol !== "https:" || target.hostname.toLowerCase() !== domain || target.username || target.password || target.port) return Response.json({ error: "The destination must be HTTPS on the verified workspace domain." }, { status: 409, headers });
    const connection = await db.from("workspace_integrations").select("shopify_store_domain,shopify_admin_token").eq("user_id", userId).eq("domain", domain).maybeSingle();
    if (connection.error) throw connection.error;
    if (!connection.data?.shopify_store_domain || !connection.data.shopify_admin_token) return Response.json({ error: "Connect Shopify in workspace settings before deployment." }, { status: 409, headers });
    let token: string;
    try { token = decryptConnectedShopifyToken(connection.data.shopify_admin_token); }
    catch { return Response.json({ error: "The Shopify token could not be decrypted. Reconnect Shopify with the configured encryption key." }, { status: 503, headers }); }
    const path = finding.normalized_path.split("?")[0].replace(/\/$/, "") || "/";
    const destinationPath = `${target.pathname}${target.search}`;
    const deployed = await deployShopifyUrlRedirect(connection.data.shopify_store_domain, token, path, destinationPath);
    const saved = await db.from("recovery_findings").update({ approval_status: "deployed" }).eq("id", finding.id).eq("approval_status", "approved").select("id").maybeSingle();
    if (saved.error || !saved.data) return Response.json({ error: "Shopify deployed the redirect, but CiteMend could not save the deployed status. Verify Shopify before retrying." }, { status: 503, headers });
    const verification = await verifyDeployedRedirect(`https://${domain}${path}`, target.href, domain);
    return Response.json({ ok: true, redirectId: deployed.id, status: "deployed", verification }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Shopify redirect deployment failed." }, { status: 503, headers });
  }
}
