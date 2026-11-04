import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { hasProSubscription } from "@/lib/subscription";
import { routingPair } from "@/lib/edge-redirect-rule";
import { canDeployApproved } from "@/lib/recovery-policy";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to manage redirects." }, { status: 401 });
  const body = await request.text();
  if (body.length > 2048) return Response.json({ error: "Request is too large." }, { status: 413 });

  let input: { linkId?: unknown; active?: unknown };
  try { input = JSON.parse(body); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  if (!input || typeof input.linkId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.linkId) || typeof input.active !== "boolean") {
    return Response.json({ error: "Invalid redirect request." }, { status: 400 });
  }
  if (input.active) {
    try {
      if (!await hasProSubscription(userId)) return Response.json({ error: "Upgrade to Pro to publish redirects.", code: "PRO_REQUIRED" }, { status: 403 });
    } catch { return Response.json({ error: "Subscription status is temporarily unavailable." }, { status: 503 }); }
  }

  try {
    const db = createServerDatabase();
    const { data: link, error: linkError } = await db.from("broken_links").select("id,audit_id,cited_url,http_status,url_state,approval_status,match_confidence,suggested_redirect").eq("id", input.linkId).maybeSingle();
    if (linkError) throw linkError;
    if (!link) return Response.json({ error: "Link not found." }, { status: 404 });
    const { data: audit, error: auditError } = await db.from("audits").select("domain").eq("id", link.audit_id).eq("user_id", userId).maybeSingle();
    if (auditError) throw auditError;
    if (!audit) return Response.json({ error: "Link not found." }, { status: 404 });
    if (link.http_status !== 404 || !link.suggested_redirect) return Response.json({ error: "This link has no verified 301 destination." }, { status: 422 });
    if (input.active && !canDeployApproved({ urlState: link.url_state, httpStatus: link.http_status, approvalStatus: link.approval_status, similarityPercent: link.match_confidence })) return Response.json({ error: "Preview and approve this eligible destination before publishing it." }, { status: 409 });
    const pair = routingPair(link.cited_url, link.suggested_redirect, audit.domain);
    if (!pair) return Response.json({ error: "The redirect must stay on this domain and use a distinct HTTPS destination." }, { status: 422 });

    const { data: existing, error: existingError } = await db.from("redirect_rules").select("id,user_id").eq("source_host", pair.source_host).eq("source_path", pair.source_path).maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.user_id !== userId) return Response.json({ error: "A rule for this URL already belongs to another account." }, { status: 409 });
    if (!existing && !input.active) return Response.json({ active: false });

    const payload = { ...pair, source_link_id: link.id, active: input.active, updated_at: new Date().toISOString() };
    const result = existing
      ? await db.from("redirect_rules").update(payload).eq("id", existing.id).eq("user_id", userId)
      : await db.from("redirect_rules").insert({ ...payload, user_id: userId });
    if (result.error) throw result.error;
    return Response.json({ active: input.active });
  } catch {
    return Response.json({ error: "Redirect rules are temporarily unavailable. Apply migration 007 if it has not been applied." }, { status: 503 });
  }
}
