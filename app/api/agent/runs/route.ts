import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { readRequestJson } from "@/lib/read-request-json";
import { canDeployApproved } from "@/lib/recovery-policy";
import { routingPair } from "@/lib/edge-redirect-rule";
import { tracePublicRedirects, verifyUrl } from "@/lib/seo";
import { exportSyncRules, pushShopifyRedirect, deleteShopifyRedirect } from "@/lib/redirect-sync";
import { decryptShopifyAccessToken } from "@/lib/shopify";
import { hasProSubscription } from "@/lib/subscription";
import { buildAgentStageHistory, canExecuteAgentAction, isAgentAction, nextAgentStep, riskForAgentAction, rollbackAgentSnapshot, type AgentAction, type AgentStep } from "@/lib/autonomous-agent";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE = { "Cache-Control": "private, no-store" };
export const maxDuration = 60;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE });
type HistoryEntry = { step: AgentStep; at: string; detail?: string };
function crossOrigin(request: Request) {
  const origin = request.headers.get("origin"); if (!origin) return false;
  try { return new URL(origin).origin !== new URL(request.url).origin; } catch { return true; }
}
function artifact(action: AgentAction, domain: string, prompt: string, evidence: Record<string, unknown>) {
  switch (action) {
    case "capsule_draft": return { type: action, status: "draft", title: `Citation Capsule for ${domain}`, buyerPrompt: prompt, evidence, humanReviewRequired: true };
    case "jsonld_recommendation": return { type: action, status: "recommendation", jsonLd: { "@context": "https://schema.org", "@type": "Organization", name: domain }, evidence, humanReviewRequired: true };
    case "forensic_diagnosis": return { type: action, status: "diagnosis_ready", evidence, statement: "This report summarizes saved observations and checks; it does not claim access to private model reasoning." };
    case "llms_txt_preview": return { type: action, status: "preview", content: `# ${domain}\n\n## Verified site\n- https://${domain}/\n\nGenerated as a reviewable preview; not published.`, humanReviewRequired: true };
    default: return null;
  }
}
function nextHistory(history: unknown, step: AgentStep, detail?: string): HistoryEntry[] {
  const prior = Array.isArray(history) ? history as HistoryEntry[] : [];
  const last = prior.at(-1);
  if (last && !nextAgentStep(last.step, step)) throw new Error("Invalid agent stage transition.");
  return [...prior, { step, at: new Date().toISOString(), ...(detail ? { detail } : {}) }];
}

export async function GET(request: Request) {
  let userId: string | null;
  try { userId = (await auth()).userId; } catch { return json({ error: "Authentication is temporarily unavailable." }, 503); }
  if (!userId) return json({ error: "Sign in to view autonomous recovery runs." }, 401);
  const domain = new URL(request.url).searchParams.get("domain");
  try {
    const db = createServerDatabase();
    let query = db.from("autonomous_agent_runs").select("id,user_id,workspace_domain,audit_id,opportunity_id,broken_link_id,action_type,risk_level,current_step,run_status,human_approved_by,human_approved_at,evidence_json,recommendation_json,result_json,stage_history_json,rollback_snapshot_json,rollback_completed_at,error_message,created_at,updated_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
    if (domain) query = query.eq("workspace_domain", domain);
    const [runs, policies] = await Promise.all([query, db.from("workspace_governance_policies").select("workspace_domain,monthly_scan_quota,scans_used_this_month,usage_month").eq("user_id", userId)]);
    if (runs.error || policies.error) throw runs.error ?? policies.error;
    return json({ runs: runs.data ?? [], policies: policies.data ?? [] });
  } catch { return json({ error: "Autonomous recovery queue is unavailable." }, 503); }
}

export async function POST(request: Request) {
  let userId: string | null;
  try { userId = (await auth()).userId; } catch { return json({ error: "Authentication is temporarily unavailable." }, 503); }
  if (!userId) return json({ error: "Sign in to manage autonomous recovery runs." }, 401);
  if (crossOrigin(request)) return json({ error: "Cross-origin requests are not allowed." }, 403);
  const parsed = await readRequestJson(request, 8192);
  if (parsed.kind === "too_large") return json({ error: "Request body exceeds 8 KiB." }, 413);
  if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return json({ error: "Send a valid JSON request." }, 400);
  const input = parsed.value as Record<string, unknown>;
  const operation = input.operation;
  const db = createServerDatabase();

  if (operation === "start") {
    if (typeof input.auditId !== "string" || !UUID.test(input.auditId) || !isAgentAction(input.actionType)) return json({ error: "Provide an owned audit and supported agent action." }, 400);
    const action = input.actionType; const risk = riskForAgentAction(action);
    if ((risk === "high_risk_external_approval" || risk === "medium_risk_review") && input.confirmationRequired !== true) return json({ error: "This action requires review; confirm that it should be queued for human approval." }, 400);
    if (action === "schedule_reverification" && input.scheduleAt !== undefined && (typeof input.scheduleAt !== "string" || !Number.isFinite(Date.parse(input.scheduleAt)) || Date.parse(input.scheduleAt) <= Date.now() || Date.parse(input.scheduleAt) > Date.now() + 365 * 86400000)) return json({ error: "Choose a reverification date within the next year." }, 400);
    if (["shopify_301_deploy", "vercel_301_export", "cloudflare_301_export"].includes(action) && (typeof input.linkId !== "string" || !UUID.test(input.linkId))) return json({ error: "Select one approved broken-link recovery." }, 400);
    if (action === "publisher_outreach_draft" && (typeof input.opportunityId !== "string" || !UUID.test(input.opportunityId))) return json({ error: "Select an owned publisher opportunity." }, 400);
    try {
      const auditResult = await db.from("audits").select("id,domain,buyer_prompt,ground_truth_pricing,llms_txt_content").eq("id", input.auditId).eq("user_id", userId).maybeSingle();
      if (auditResult.error) throw auditResult.error;
      if (!auditResult.data) return json({ error: "Owned audit not found." }, 404);
      const domain = auditResult.data.domain;
      const quota = await db.rpc("reserve_workspace_agent_scan", { p_user_id: userId, p_workspace_domain: domain });
      if (quota.error) throw quota.error;
      if (!quota.data) return json({ error: "Monthly agent scan quota reached for this workspace." }, 429);

      const now = new Date().toISOString();
      const evidence: Record<string, unknown> = { auditId: auditResult.data.id, domain, buyerPrompt: auditResult.data.buyer_prompt, recordedAt: now };
      let link: { id: string; cited_url: string; suggested_redirect: string | null; http_status: number; url_state: string; approval_status: string; match_confidence: number | null } | null = null;
      let safety: Record<string, unknown> | null = null;
      let snapshot: Record<string, unknown> = { previous_state: { result_json: {} } };
      const recommendationDetails: Record<string, unknown> = {};
      if (action === "entity_baseline_update") {
        const policy = await db.from("workspace_governance_policies").select("entity_truth_baseline_json").eq("user_id", userId).eq("workspace_domain", domain).maybeSingle();
        if (policy.error) throw policy.error;
        snapshot = { previous_state: { result_json: {}, entity_truth_baseline_json: policy.data?.entity_truth_baseline_json ?? {} } };
        recommendationDetails.baseline = { domain, buyerPrompt: auditResult.data.buyer_prompt, groundTruthPricing: auditResult.data.ground_truth_pricing, basedOnAudit: auditResult.data.id };
      }
      if (action === "schedule_reverification") recommendationDetails.scheduleAt = typeof input.scheduleAt === "string" ? input.scheduleAt : new Date(Date.now() + 7 * 86400000).toISOString();
      if (typeof input.linkId === "string") {
        const linkResult = await db.from("broken_links").select("id,cited_url,suggested_redirect,http_status,url_state,approval_status,match_confidence,audits!inner(user_id,domain)").eq("id", input.linkId).eq("audit_id", auditResult.data.id).eq("audits.user_id", userId).maybeSingle();
        if (linkResult.error) throw linkResult.error;
        if (!linkResult.data) return json({ error: "Owned recovery link not found." }, 404);
        link = linkResult.data;
        evidence.recoveryLink = link;
        if (["shopify_301_deploy", "vercel_301_export", "cloudflare_301_export"].includes(action)) {
          const destination = link.suggested_redirect;
          let safe = false; let reason = "Destination is missing or not an approved live recovery.";
          let sourcePath: string | null = null;
          if (destination && canDeployApproved({ urlState: link.url_state, httpStatus: link.http_status, approvalStatus: link.approval_status, similarityPercent: link.match_confidence })) {
            const pair = routingPair(link.cited_url, destination, domain);
            if (!pair) reason = "Source and destination do not match the verified workspace domain.";
            else {
              sourcePath = pair.source_path;
              const [sourceCheck, destinationTrace, active] = await Promise.all([verifyUrl(link.cited_url), tracePublicRedirects(destination), db.from("redirect_rules").select("id,user_id,target_url,destination").eq("source_host", domain).eq("source_path", pair.source_path).eq("active", true).eq("is_active", true).limit(10)]);
              if (active.error) throw active.error;
              const src = new URL(link.cited_url);
              const loops = destinationTrace.visitedUrls.some(value => { const url = new URL(value); return url.origin === src.origin && url.pathname.replace(/\/$/, "") === src.pathname.replace(/\/$/, ""); });
              const leavesDomain = destinationTrace.visitedUrls.some(value => new URL(value).hostname !== domain);
              const conflict = (active.data ?? []).some(rule => rule.user_id !== userId || (rule.target_url !== destination && rule.destination !== destination));
              safe = sourceCheck.state === "404" && sourceCheck.httpStatus === 404 && destinationTrace.status === 200 && !loops && !leavesDomain && !conflict;
              reason = safe ? "Source 404, destination HTTP 200, canonical host, loop and active-rule conflict checks passed." : [sourceCheck.state !== "404" ? "Source is not a live-verified 404." : "", destinationTrace.status !== 200 ? "Destination does not resolve to HTTP 200." : "", loops ? "Redirect loop detected." : "", leavesDomain ? "Redirect chain leaves canonical host." : "", conflict ? "Conflicting active redirect exists." : ""].filter(Boolean).join(" ");
            }
          }
          safety = { passed: safe, reason, sourcePath, checkedAt: now };
          const priorRule = sourcePath ? await db.from("redirect_rules").select("*").eq("user_id", userId).eq("source_host", domain).eq("source_path", sourcePath).maybeSingle() : { data: null, error: null };
          if (priorRule.error) throw priorRule.error;
          snapshot = { previous_state: { redirect_rule: priorRule.data, broken_link: { approval_status: link.approval_status, previous_destination_url: link.suggested_redirect }, result_json: {} } };
          evidence.redirectSafety = safety;
        }
      }
      if (action === "publisher_outreach_draft") {
        const opp = await db.from("citation_hijack_opportunities").select("id,audit_id,domain,prompt_query,outreach_draft,audits!inner(user_id)").eq("id", input.opportunityId as string).eq("audit_id", auditResult.data.id).eq("audits.user_id", userId).maybeSingle();
        if (opp.error) throw opp.error; if (!opp.data) return json({ error: "Owned publisher opportunity not found." }, 404);
        evidence.opportunity = opp.data;
      }
      const recommendation = { actionType: action, riskLevel: risk, requiresExplicitApproval: risk !== "low_risk_auto", externalActionNeverAutoExecutes: risk === "high_risk_external_approval", safety, proposedAt: now, ...recommendationDetails };
      const histories = buildAgentStageHistory(now);
      const internal = artifact(action, domain, auditResult.data.buyer_prompt ?? "", evidence);
      const auto = risk === "low_risk_auto";
      const history: HistoryEntry[] = auto ? [...histories, { step: "execute", at: now, detail: "Low-risk draft generated internally." }, { step: "verify", at: now, detail: "Generated artifact is present; no production change was made." }] : histories;
      const result = auto ? internal ?? {} : {};
      const saved = await db.from("autonomous_agent_runs").insert({ user_id: userId, workspace_domain: domain, audit_id: auditResult.data.id, opportunity_id: typeof input.opportunityId === "string" ? input.opportunityId : null, broken_link_id: typeof input.linkId === "string" ? input.linkId : null, action_type: action, risk_level: risk, current_step: auto ? "verify" : "request_approval", run_status: auto ? "completed" : "awaiting_approval", evidence_json: evidence, recommendation_json: recommendation, result_json: result, stage_history_json: history, rollback_snapshot_json: snapshot }).select("*").single();
      if (saved.error) throw saved.error;
      return json({ run: saved.data });
    } catch { return json({ error: "Could not start this agent run. Confirm the workspace migrations are applied and try again." }, 503); }
  }

  if (typeof input.runId !== "string" || !UUID.test(input.runId)) return json({ error: "Provide a valid agent run ID." }, 400);
  let claimedExecutionId: string | null = null;
  try {
    const found = await db.from("autonomous_agent_runs").select("*").eq("id", input.runId).eq("user_id", userId).maybeSingle();
    if (found.error) throw found.error;
    const run = found.data;
    if (!run) return json({ error: "Agent run not found." }, 404);
    if (operation === "approve_execute") {
      if (run.current_step !== "request_approval" || run.run_status !== "awaiting_approval") return json({ error: "This run is not awaiting approval." }, 409);
      if (input.humanApproval !== true) return json({ error: "Explicit human approval is required before execution." }, 403);
      if (!isAgentAction(run.action_type)) return json({ error: "Agent action is invalid." }, 409);
      let snapshot = run.rollback_snapshot_json as Record<string, unknown> | null;
      const evidence = run.evidence_json as Record<string, unknown>;
      const safety = evidence.redirectSafety as { passed?: boolean; sourcePath?: string | null } | undefined;
      if (!canExecuteAgentAction({ action: run.action_type, humanApproved: true, safetyChecksPassed: safety?.passed === true, rollbackSnapshot: snapshot })) return json({ error: "Action-specific permission, live redirect safety checks, or rollback snapshot is missing." }, 409);
      const at = new Date().toISOString();
      const executionHistory = nextHistory(run.stage_history_json, "execute", "Approved by a workspace owner; action execution claimed.");
      const claim = await db.from("autonomous_agent_runs").update({ current_step: "execute", run_status: "running", human_approved_by: userId, human_approved_at: at, stage_history_json: executionHistory, updated_at: at }).eq("id", run.id).eq("user_id", userId).eq("current_step", "request_approval").eq("run_status", "awaiting_approval").select("id").maybeSingle();
      if (claim.error) throw claim.error; if (!claim.data) return json({ error: "This run was already approved or changed in another session." }, 409);
      claimedExecutionId = run.id;
      let result: Record<string, unknown> = {};
      let status = "completed";
      if (run.action_type === "entity_baseline_update") {
        const recommendation = run.recommendation_json as Record<string, unknown>;
        const policy = await db.from("workspace_governance_policies").select("entity_truth_baseline_json").eq("user_id", userId).eq("workspace_domain", run.workspace_domain).maybeSingle();
        if (policy.error) throw policy.error;
        const baseline = { ...(recommendation.baseline as Record<string, unknown> ?? {}), updatedAt: at, sourceAuditId: run.audit_id };
        const savedPolicy = await db.from("workspace_governance_policies").upsert({ user_id: userId, workspace_domain: run.workspace_domain, entity_truth_baseline_json: baseline }, { onConflict: "user_id,workspace_domain" });
        if (savedPolicy.error) throw savedPolicy.error;
        snapshot = { previous_state: { ...rollbackAgentSnapshot(snapshot), entity_truth_baseline_json: policy.data?.entity_truth_baseline_json ?? {} } };
        result = { baseline, status: "saved" };
      } else if (run.action_type === "schedule_reverification") {
        const scheduleAt = (run.recommendation_json as Record<string, unknown>).scheduleAt;
        const scheduled = await db.from("scheduled_reports").insert({ user_id: userId, workspace_domain: run.workspace_domain, report_type: "reverification", schedule_at: typeof scheduleAt === "string" ? scheduleAt : new Date(Date.now() + 7 * 86400000).toISOString(), payload_json: { auditId: run.audit_id, createdByAgentRun: run.id } }).select("id,schedule_at,status").single();
        if (scheduled.error) throw scheduled.error;
        snapshot = { previous_state: { ...rollbackAgentSnapshot(snapshot), scheduled_report_id: scheduled.data.id } };
        result = { scheduledReport: scheduled.data };
      } else if (["shopify_301_deploy", "vercel_301_export", "cloudflare_301_export"].includes(run.action_type)) {
        if (!run.broken_link_id) return json({ error: "This run no longer references a recovery link." }, 409);
        const linkResult = await db.from("broken_links").select("id,cited_url,suggested_redirect,http_status,url_state,approval_status,match_confidence").eq("id", run.broken_link_id).eq("audit_id", run.audit_id).maybeSingle();
        if (linkResult.error) throw linkResult.error; const link = linkResult.data;
        if (!link?.suggested_redirect || !canDeployApproved({ urlState: link.url_state, httpStatus: link.http_status, approvalStatus: link.approval_status, similarityPercent: link.match_confidence })) return json({ error: "The selected recovery is no longer approved and deployable." }, 409);
        const pair = routingPair(link.cited_url, link.suggested_redirect, run.workspace_domain);
        if (!pair) return json({ error: "Redirect safety checks failed during approval. Refresh the recommendation and review the route." }, 409);
        const [sourceCheck, trace, activeRules] = await Promise.all([verifyUrl(link.cited_url), tracePublicRedirects(link.suggested_redirect), db.from("redirect_rules").select("id,user_id,target_url,destination").eq("source_host", run.workspace_domain).eq("source_path", pair.source_path).eq("active", true).eq("is_active", true).limit(10)]);
        if (activeRules.error) throw activeRules.error;
        const sourceUrl = new URL(link.cited_url);
        const loops = trace.visitedUrls.some(value => { const url = new URL(value); return url.origin === sourceUrl.origin && url.pathname.replace(/\/$/, "") === sourceUrl.pathname.replace(/\/$/, ""); });
        const leavesDomain = trace.visitedUrls.some(value => new URL(value).hostname !== run.workspace_domain);
        const hasConflict = (activeRules.data ?? []).some(rule => rule.user_id !== userId || (rule.target_url !== link.suggested_redirect && rule.destination !== link.suggested_redirect));
        if (sourceCheck.state !== "404" || sourceCheck.httpStatus !== 404 || trace.status !== 200 || loops || leavesDomain || hasConflict) return json({ error: "Redirect safety checks failed during approval: source must remain 404, destination must resolve to 200, and loop/open-redirect/conflict checks must pass." }, 409);
        const priorRule = await db.from("redirect_rules").select("*").eq("user_id", userId).eq("source_host", run.workspace_domain).eq("source_path", pair.source_path).maybeSingle();
        if (priorRule.error) throw priorRule.error;
        snapshot = { previous_state: { ...rollbackAgentSnapshot(snapshot), redirect_rule: priorRule.data, broken_link: { approval_status: link.approval_status, previous_destination_url: link.suggested_redirect } } };
        if (run.action_type === "shopify_301_deploy") {
          if (!await hasProSubscription(userId)) return json({ error: "A Pro subscription is required to deploy Shopify redirects." }, 403);
          const connection = await db.from("workspace_integrations").select("shopify_store_domain,shopify_admin_token").eq("user_id", userId).eq("domain", run.workspace_domain).maybeSingle();
          if (connection.error) throw connection.error; if (!connection.data?.shopify_store_domain || !connection.data.shopify_admin_token) return json({ error: "Connect Shopify before approving this deployment." }, 409);
          const token = connection.data.shopify_admin_token.startsWith("v1.") ? decryptShopifyAccessToken(connection.data.shopify_admin_token) : connection.data.shopify_admin_token;
          const remoteId = await pushShopifyRedirect(connection.data.shopify_store_domain, token, { id: link.id, source: pair.source_path, destination: pair.destination });
          const progress = await db.from("autonomous_agent_runs").update({ result_json: { status: "shopify_redirect_created", shopifyRedirectId: remoteId, destination: link.suggested_redirect }, updated_at: at }).eq("id", run.id).eq("user_id", userId).select("id").maybeSingle();
          if (progress.error || !progress.data) { await deleteShopifyRedirect(connection.data.shopify_store_domain, token, remoteId); throw progress.error ?? new Error("Agent run was not available to save the Shopify rollback ID."); }
          const [sourceState, sourceTrace] = await Promise.all([verifyUrl(link.cited_url).catch(() => null), tracePublicRedirects(link.cited_url).catch(() => null)]);
          const normalized = (value: string) => { const url = new URL(value); return `${url.origin}${url.pathname.replace(/\/$/, "")}${url.search}`; };
          const destinationVerified = sourceState?.state === "301" && sourceTrace?.status === 200 && normalized(sourceTrace.finalUrl) === normalized(pair.destination);
          const previousRule = snapshot?.previous_state && typeof snapshot.previous_state === "object" ? (snapshot.previous_state as Record<string, unknown>).redirect_rule as Record<string, unknown> | null : null;
          const payload = { user_id: userId, source_link_id: link.id, source_host: run.workspace_domain, source_path: pair.source_path, destination: pair.destination, domain: run.workspace_domain, target_url: pair.destination, active: destinationVerified, is_active: destinationVerified, synced_to_cms: true, shopify_redirect_id: remoteId };
          const savedRule = previousRule?.id ? await db.from("redirect_rules").update(payload).eq("id", previousRule.id as string).eq("user_id", userId) : await db.from("redirect_rules").insert(payload);
          if (savedRule.error) throw savedRule.error;
          if (destinationVerified) { const deployed = await db.from("broken_links").update({ approval_status: "deployed", deployed_at: at }).eq("id", link.id).eq("audit_id", run.audit_id); if (deployed.error) throw deployed.error; }
          result = { status: destinationVerified ? "shopify_redirect_created_and_verified" : "shopify_redirect_created_verification_pending", shopifyRedirectId: remoteId, destination: link.suggested_redirect, technicalDeploymentVerified: destinationVerified };
          if (!destinationVerified) status = "awaiting_external_deploy";
        } else {
          const format = run.action_type === "vercel_301_export" ? "vercel" : "cloudflare";
          result = { status: "approved_deployment_file_ready", platform: format, content: exportSyncRules(format, [{ id: link.id, source: pair.source_path, destination: pair.destination }]), manualDeploymentRequired: true };
          status = "awaiting_external_deploy";
        }
      } else if (run.action_type === "publisher_outreach_draft") {
        const opportunityId = run.opportunity_id;
        if (!opportunityId) return json({ error: "This run no longer references a publisher opportunity." }, 409);
        const opportunity = await db.from("citation_hijack_opportunities").select("id,outreach_draft").eq("id", opportunityId).eq("audit_id", run.audit_id).maybeSingle();
        if (opportunity.error) throw opportunity.error; if (!opportunity.data?.outreach_draft) return json({ error: "No reviewed outreach draft exists for this opportunity." }, 409);
        result = { status: "human_review_draft_ready", draft: opportunity.data.outreach_draft, sent: false, notice: "CiteMend never auto-sends outreach or posts to publishers." };
      }
      const history = executionHistory;
      if (!nextAgentStep("execute", "verify")) throw new Error("Agent execution state is invalid.");
      history.push({ step: "verify", at, detail: status === "awaiting_external_deploy" ? run.action_type === "shopify_301_deploy" ? "Shopify accepted the redirect, but the live source-to-destination 301 was not independently observed yet." : "A deployable file was generated; no production change was applied by CiteMend." : "The approved action result was persisted and verified." });
      const updated = await db.from("autonomous_agent_runs").update({ current_step: "verify", run_status: status, rollback_snapshot_json: snapshot, result_json: result, stage_history_json: history, updated_at: at }).eq("id", run.id).eq("user_id", userId).eq("current_step", "execute").eq("run_status", "running").select("*").maybeSingle();
      if (updated.error) throw updated.error; if (!updated.data) return json({ error: "Agent run changed in another session; reload the queue." }, 409);
      claimedExecutionId = null;
      return json({ run: updated.data });
    }
    if (operation === "rollback") {
      if (!(["verify", "execute"].includes(run.current_step)) || !run.rollback_snapshot_json) return json({ error: "This run has no executed action available to roll back." }, 409);
      const previous = rollbackAgentSnapshot(run.rollback_snapshot_json);
      const result = run.result_json as Record<string, unknown>;
      if (run.action_type === "shopify_301_deploy" && typeof result.shopifyRedirectId === "string") {
        const connection = await db.from("workspace_integrations").select("shopify_store_domain,shopify_admin_token").eq("user_id", userId).eq("domain", run.workspace_domain).maybeSingle();
        if (connection.error) throw connection.error; if (!connection.data?.shopify_store_domain || !connection.data.shopify_admin_token) return json({ error: "Shopify is required to roll back this remote redirect." }, 409);
        const token = connection.data.shopify_admin_token.startsWith("v1.") ? decryptShopifyAccessToken(connection.data.shopify_admin_token) : connection.data.shopify_admin_token;
        await deleteShopifyRedirect(connection.data.shopify_store_domain, token, result.shopifyRedirectId);
      }
      if (run.action_type === "shopify_301_deploy" && Object.hasOwn(previous, "redirect_rule")) {
        if (!run.broken_link_id) return json({ error: "This run no longer references a recovery link." }, 409);
        const oldRule = previous.redirect_rule as Record<string, unknown> | null;
        const current = await db.from("redirect_rules").select("id").eq("user_id", userId).eq("source_link_id", run.broken_link_id).maybeSingle();
        if (current.error) throw current.error;
        if (oldRule && current.data) { const restored = await db.from("redirect_rules").update(oldRule as never).eq("id", current.data.id).eq("user_id", userId); if (restored.error) throw restored.error; }
        else if (current.data) { const removed = await db.from("redirect_rules").delete().eq("id", current.data.id).eq("user_id", userId); if (removed.error) throw removed.error; }
      }
      if (Object.hasOwn(previous, "entity_truth_baseline_json")) { const baseline = previous.entity_truth_baseline_json && typeof previous.entity_truth_baseline_json === "object" ? previous.entity_truth_baseline_json as Record<string, unknown> : {}; const restored = await db.from("workspace_governance_policies").upsert({ user_id: userId, workspace_domain: run.workspace_domain, entity_truth_baseline_json: baseline }, { onConflict: "user_id,workspace_domain" }); if (restored.error) throw restored.error; }
      if (typeof previous.scheduled_report_id === "string") { const removed = await db.from("scheduled_reports").delete().eq("id", previous.scheduled_report_id).eq("user_id", userId); if (removed.error) throw removed.error; }
      if (run.broken_link_id && run.action_type === "shopify_301_deploy") { const oldLink = previous.broken_link as Record<string, unknown> | undefined; const status = typeof oldLink?.approval_status === "string" ? oldLink.approval_status : "approved"; const destination = typeof oldLink?.previous_destination_url === "string" ? oldLink.previous_destination_url : null; const restored = await db.from("broken_links").update({ approval_status: status, suggested_redirect: destination, rolled_back_at: new Date().toISOString() }).eq("id", run.broken_link_id).eq("audit_id", run.audit_id); if (restored.error) throw restored.error; }
      const at = new Date().toISOString();
      const verificationHistory = run.current_step === "execute" ? nextHistory(run.stage_history_json, "verify", "Execution failed and the saved snapshot was selected for restoration.") : Array.isArray(run.stage_history_json) ? run.stage_history_json as HistoryEntry[] : [];
      const history = nextHistory(verificationHistory, "rollback", "Restored the saved rollback snapshot.");
      const previousResult = previous.result_json && typeof previous.result_json === "object" ? previous.result_json as Record<string, unknown> : {};
      const updated = await db.from("autonomous_agent_runs").update({ current_step: "rollback", run_status: "rolled_back", result_json: previousResult, rollback_completed_at: at, stage_history_json: history, updated_at: at }).eq("id", run.id).eq("user_id", userId).select("*").maybeSingle();
      if (updated.error) throw updated.error; if (!updated.data) return json({ error: "Could not persist rollback state." }, 409);
      return json({ run: updated.data, restoredState: previous });
    }
    return json({ error: "Unsupported agent operation." }, 400);
  } catch {
    if (claimedExecutionId) await db.from("autonomous_agent_runs").update({ run_status: "failed", error_message: "Execution did not complete. Review the saved snapshot and use rollback if an external action was started.", updated_at: new Date().toISOString() }).eq("id", claimedExecutionId).eq("user_id", userId).eq("current_step", "execute");
    return json({ error: "Agent action could not be completed. Check the run and workspace configuration." }, 503);
  }
}
