import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { encryptShopifyAccessToken, verifyShopifyConnection } from "@/lib/shopify";

const privateHeaders = { "Cache-Control": "private, no-store" };
const MAX_BODY_LENGTH = 8192;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

async function readInput(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_LENGTH) return null;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_LENGTH) return null;
    const input: unknown = JSON.parse(body);
    return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function normalizedDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return normalizeDashboardDomain(value); } catch { return null; }
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to check the Shopify connection." }, { status: 401, headers: privateHeaders });
  const domain = normalizedDomain(new URL(request.url).searchParams.get("domain"));
  if (!domain) return Response.json({ error: "Provide a valid domain." }, { status: 400, headers: privateHeaders });

  try {
    const db = createServerDatabase();
    const { data: audit, error: auditError } = await db.from("audits").select("id")
      .eq("user_id", userId).eq("domain", domain).limit(1).maybeSingle();
    if (auditError) throw auditError;
    if (!audit) return Response.json({ error: "This domain is not associated with your account." }, { status: 404, headers: privateHeaders });
    const { data: connection, error } = await db.from("cms_connections").select("shop_subdomain")
      .eq("user_id", userId).eq("domain", domain).eq("platform", "shopify").maybeSingle();
    if (error) throw error;
    return Response.json({ connected: Boolean(connection), shopSubdomain: connection?.shop_subdomain ?? null }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Shopify connection status is unavailable. Apply migration 013 if it has not been applied." }, { status: 503, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to connect Shopify." }, { status: 401, headers: privateHeaders });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin Shopify connection requests are not allowed." }, { status: 403, headers: privateHeaders });

  const input = await readInput(request);
  const domain = normalizedDomain(input?.domain);
  if (!input || !domain || typeof input.shopSubdomain !== "string" || typeof input.accessToken !== "string"
      || input.shopSubdomain.length > 255 || input.accessToken.length < 8 || input.accessToken.length > 4096) {
    return Response.json({ error: "Provide a domain, Shopify myshopify.com subdomain, and Admin API token." }, { status: 400, headers: privateHeaders });
  }

  let encryptedToken: string;
  try { encryptedToken = encryptShopifyAccessToken(input.accessToken); }
  catch (cause) { return Response.json({ error: cause instanceof Error ? cause.message : "Shopify token encryption is unavailable." }, { status: 503, headers: privateHeaders }); }

  try {
    const db = createServerDatabase();
    const { data: audit, error: auditError } = await db.from("audits").select("id")
      .eq("user_id", userId).eq("domain", domain).limit(1).maybeSingle();
    if (auditError) throw auditError;
    if (!audit) return Response.json({ error: "This domain is not associated with your account." }, { status: 404, headers: privateHeaders });

    let shop: Awaited<ReturnType<typeof verifyShopifyConnection>>;
    try { shop = await verifyShopifyConnection(input.shopSubdomain, input.accessToken); }
    catch (cause) { return Response.json({ error: cause instanceof Error ? cause.message : "Shopify could not verify this store and token." }, { status: 422, headers: privateHeaders }); }

    const { error } = await db.from("cms_connections").upsert({
      user_id: userId,
      domain,
      platform: "shopify",
      shop_subdomain: shop.myshopifyDomain.toLowerCase(),
      access_token: encryptedToken,
    }, { onConflict: "user_id,domain,platform" });
    if (error) throw error;
    return Response.json({ connected: true, shopName: shop.name, shopSubdomain: shop.myshopifyDomain }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Shopify connection could not be saved. Confirm migration 013 and the Supabase service key." }, { status: 503, headers: privateHeaders });
  }
}
