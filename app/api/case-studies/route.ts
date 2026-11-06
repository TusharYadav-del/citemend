import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { canWorkspace } from "@/lib/rbac";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { createServerDatabase } from "@/lib/supabase-server";
import { readRequestJson } from "@/lib/read-request-json";
import { buildVerifiedCaseStudy } from "@/lib/case-study-builder";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
function workspacePath(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "") || "/"}`; } catch { return null; }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) { try { if (new URL(origin).origin !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not allowed." }, 403); } catch { return json({ error: "Invalid request origin." }, 403); } }
  const session = await auth();
  if (!session.userId) return json({ error: "Sign in to create a recovery case study." }, 401);
  const parsed = await readRequestJson(request, 4096);
  if (parsed.kind === "too_large") return json({ error: "Request body exceeds 4 KiB." }, 413);
  if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return json({ error: "Send an audit ID and anonymize setting." }, 400);
  const input = parsed.value as Record<string, unknown>;
  if (typeof input.auditId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.auditId) || typeof input.anonymize !== "boolean") return json({ error: "Provide a valid audit ID and anonymize setting." }, 400);
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    if (!canWorkspace(access.role, "draft")) return json({ error: "Editor permission is required to create a case study." }, 403);
    const auditResult = await db.from("audits").select("id,user_id,domain,created_at,buyer_prompt,agency_brand_name,agency_primary_color").eq("id", input.auditId).in("user_id", access.ownerUserIds).maybeSingle();
    if (auditResult.error) throw auditResult.error;
    if (!auditResult.data) return json({ error: "Audit not found in this workspace." }, 404);
    const audit = auditResult.data;
    const [brokenResult, outcomesResult, observationsResult, redirectsResult, visitsResult, actionsResult] = await Promise.all([
      db.from("broken_links").select("id,cited_url,http_status,url_state,approval_status,suggested_redirect").eq("audit_id", audit.id).limit(500),
      db.from("recovery_outcomes").select("broken_link_id,canonical_destination_url,technical_deployment_verified_at,ai_citation_observed_at,evidence_id").eq("audit_id", audit.id).eq("domain", audit.domain).limit(500),
      db.from("ai_observation_evidence").select("id,provider,model_name,observed_at,extracted_urls_json").eq("audit_id", audit.id).eq("domain", audit.domain).order("observed_at", { ascending: false }).limit(100),
      db.from("redirect_rules").select("source_link_id,source_path,destination,active").eq("user_id", audit.user_id ?? "").eq("source_host", audit.domain).eq("active", true).limit(500),
      db.from("rescued_ai_visits").select("broken_path,rescued_target_url,created_at").eq("domain", audit.domain).eq("user_id", audit.user_id ?? "").limit(10000),
      db.from("action_audit_logs").select("action_type,target_url,created_at").eq("workspace_domain", audit.domain).eq("actor_user_id", session.userId).limit(500),
    ]);
    const firstError = [brokenResult.error, outcomesResult.error, observationsResult.error, redirectsResult.error, visitsResult.error, actionsResult.error].find(Boolean);
    if (firstError) throw firstError;
    const broken = brokenResult.data ?? [];
    const outcomes = outcomesResult.data ?? [];
    const redirects = redirectsResult.data ?? [];
    const validPairs = new Set<string>();
    for (const link of broken) {
      const destination = outcomes.find((item) => item.broken_link_id === link.id)?.canonical_destination_url
        ?? redirects.find((rule) => rule.source_link_id === link.id)?.destination;
      if (destination) {
        const sourcePath = workspacePath(link.cited_url);
        if (sourcePath) validPairs.add(`${sourcePath}|${workspacePath(destination)}`);
      }
    }
    const visits = (visitsResult.data ?? []).filter((visit) => {
      const sourcePath = `${audit.domain.toLowerCase()}${visit.broken_path}`;
      const targetPath = workspacePath(visit.rescued_target_url);
      return targetPath && validPairs.has(`${sourcePath}|${targetPath}`);
    });
    const caseStudy = buildVerifiedCaseStudy({
      anonymize: input.anonymize,
      estimatedPipelineValuePerVisitUsd: Number(process.env.CASE_STUDY_PIPELINE_VALUE_PER_VISIT_USD) > 0 ? Number(process.env.CASE_STUDY_PIPELINE_VALUE_PER_VISIT_USD) : null,
      audit: { id: audit.id, domain: audit.domain, createdAt: audit.created_at, buyerPrompt: audit.buyer_prompt, agencyBrandName: audit.agency_brand_name, agencyPrimaryColor: audit.agency_primary_color },
      brokenLinks: broken.map((link) => ({ id: link.id, citedUrl: link.cited_url, httpStatus: link.http_status, urlState: link.url_state, approvalStatus: link.approval_status, suggestedRedirect: link.suggested_redirect })),
      outcomes: outcomes.map((item) => ({ brokenLinkId: item.broken_link_id, canonicalDestinationUrl: item.canonical_destination_url, technicalDeploymentVerifiedAt: item.technical_deployment_verified_at, aiCitationObservedAt: item.ai_citation_observed_at, evidenceId: item.evidence_id })),
      observations: (observationsResult.data ?? []).map((item) => ({ id: item.id, provider: item.provider, modelName: item.model_name, observedAt: item.observed_at, extractedUrls: Array.isArray(item.extracted_urls_json) ? item.extracted_urls_json : [] })),
      rescuedVisits: visits.map((visit) => ({ rescuedTargetUrl: visit.rescued_target_url, createdAt: visit.created_at })),
      actions: (actionsResult.data ?? []).map((item) => ({ actionType: item.action_type, targetUrl: item.target_url, createdAt: item.created_at })),
    });
    const slug = `cs_${randomUUID().replaceAll("-", "")}`;
    const saved = await db.from("case_studies").insert({ slug, user_id: audit.user_id ?? session.userId, workspace_domain: audit.domain, audit_id: audit.id, anonymized: input.anonymize, is_public: true, study_json: caseStudy as unknown as Record<string, unknown> });
    if (saved.error) throw saved.error;
    return json({ slug, url: `/case-studies/${slug}`, caseStudy }, 201);
  } catch (error) {
    const message = error instanceof Error && /case study requires/i.test(error.message)
      ? "This audit has no qualifying verified recovery yet. Record a technical deployment plus a later citation observation, or measure at least one rescued AI visit."
      : "The case study could not be generated for this workspace.";
    return json({ error: message }, message.startsWith("This audit") ? 409 : 503);
  }
}
