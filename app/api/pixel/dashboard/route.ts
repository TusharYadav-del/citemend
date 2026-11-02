import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { routingPair } from "@/lib/edge-redirect-rule";
import { hasProSubscription } from "@/lib/subscription";

const privateHeaders = { "Cache-Control": "private, no-store" };

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return null;
  try {
    const body = await request.text();
    if (body.length > 4096) return null;
    const value: unknown = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to view pixel activity." }, { status: 401, headers: privateHeaders });

  try {
    const db = createServerDatabase();
    const { data: audits, error: auditError } = await db.from("audits").select("domain,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
    if (auditError) throw auditError;
    const domains = [...new Set((audits ?? []).map(audit => audit.domain))];
    const requestedDomain = new URL(request.url).searchParams.get("domain");
    let domain = domains[0] ?? "";
    if (requestedDomain) {
      try { domain = normalizeDashboardDomain(requestedDomain); }
      catch { return Response.json({ error: "Select a domain from your account." }, { status: 400, headers: privateHeaders }); }
      if (!domains.includes(domain)) return Response.json({ error: "This domain is not associated with your account." }, { status: 404, headers: privateHeaders });
    }
    if (!domain) return Response.json({ domain: "", domains, rules: [], events: [] }, { headers: privateHeaders });

    const [rulesResult, eventsResult] = await Promise.all([
      db.from("redirect_rules").select("id,source_path,target_url,confidence,is_active,hits_recovered,created_at")
        .eq("user_id", userId).eq("domain", domain).order("created_at", { ascending: false }).limit(200),
      db.from("ai_404_events").select("id,broken_path,ai_referrer,redirected_to,created_at")
        .eq("domain", domain).order("created_at", { ascending: false }).limit(100),
    ]);
    if (rulesResult.error || eventsResult.error) throw rulesResult.error ?? eventsResult.error;
    return Response.json({ domain, domains, rules: rulesResult.data ?? [], events: eventsResult.data ?? [] }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Pixel activity is temporarily unavailable." }, { status: 503, headers: privateHeaders });
  }
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to manage redirect rules." }, { status: 401, headers: privateHeaders });
  const input = await readBody(request);
  if (!input || typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id) || typeof input.domain !== "string") {
    return Response.json({ error: "Provide a valid redirect rule." }, { status: 400, headers: privateHeaders });
  }

  let domain: string;
  try { domain = normalizeDashboardDomain(input.domain); }
  catch { return Response.json({ error: "Provide a valid domain." }, { status: 400, headers: privateHeaders }); }
  if (typeof input.isActive !== "boolean" && typeof input.targetUrl !== "string") {
    return Response.json({ error: "Choose a redirect status or target URL to update." }, { status: 400, headers: privateHeaders });
  }

  try {
    const db = createServerDatabase();
    const { data: rule, error: ruleError } = await db.from("redirect_rules").select("id,source_path")
      .eq("id", input.id).eq("user_id", userId).eq("domain", domain).maybeSingle();
    if (ruleError) throw ruleError;
    if (!rule) return Response.json({ error: "Redirect rule not found." }, { status: 404, headers: privateHeaders });

    const publishing = input.isActive === true || typeof input.targetUrl === "string";
    if (publishing) {
      let isPro: boolean;
      try { isPro = await hasProSubscription(userId); }
      catch { return Response.json({ error: "Subscription status is temporarily unavailable." }, { status: 503, headers: privateHeaders }); }
      if (!isPro) return Response.json({ error: "Upgrade to Pro to publish or edit redirect rules.", code: "PRO_REQUIRED" }, { status: 403, headers: privateHeaders });
    }

    const updates: { active?: boolean; is_active?: boolean; destination?: string; target_url?: string; updated_at: string } = { updated_at: new Date().toISOString() };
    if (typeof input.isActive === "boolean") { updates.active = input.isActive; updates.is_active = input.isActive; }
    if (typeof input.targetUrl === "string") {
      const pair = routingPair(`https://${domain}${rule.source_path}`, input.targetUrl.trim(), domain);
      if (!pair || pair.source_path !== rule.source_path) return Response.json({ error: "The target must be a different HTTPS page on this domain." }, { status: 422, headers: privateHeaders });
      updates.destination = pair.destination;
      updates.target_url = pair.destination;
    }

    const { error } = await db.from("redirect_rules").update(updates).eq("id", rule.id).eq("user_id", userId).eq("domain", domain);
    if (error) throw error;
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Redirect rule could not be updated." }, { status: 503, headers: privateHeaders });
  }
}
