import { Suspense } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getUserAuditHistory, type UserAuditHistoryItem } from "@/lib/audit-history";
import CheckoutButton from "@/components/CheckoutButton";
import WeeklyMonitoring from "@/components/weekly-monitoring";
import { hasProSubscription } from "@/lib/subscription";
import { historyMetrics } from "@/lib/history-metrics";
import { createServerDatabase } from "@/lib/supabase-server";
import { getAuditCitationGaps } from "@/lib/citation-gap-store";
import type { CitationGap } from "@/lib/citation-gap";
import CitationGapPanel from "@/components/citation-gap-panel";
import PublishRedirect from "@/components/publish-redirect";
import RedirectExportDrawer from "@/components/RedirectExportDrawer";
import LlmsTxtGenerator from "@/components/LlmsTxtGenerator";
import OnboardingChecklist, { type OnboardingProgress } from "@/components/OnboardingChecklist";
import OpportunityCommandCenter from "@/components/OpportunityCommandCenter";
import { ENGINE_PROFILES, compareCategoryCitationRanks, describeEngineStatus, hasVerifiedMatrix, type EngineMatrixRow } from "@/lib/engine-matrix";
import RedirectSyncButton from "@/components/redirect-sync-button";
import WorkspaceIntegrations from "@/components/workspace-integrations";
import AgencyProfileSettings from "@/components/agency-profile-settings";
import DomainSwitcher from "@/components/domain-switcher";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { Sidebar } from "@/components/ui/sidebar";
import { EmptyState } from "@/components/ui/empty-state";
import { SparklineChart } from "@/components/ui/sparkline-chart";
import { RecoveryApprovalControls } from "@/components/RecoveryApprovalControls";
import AuditTemplates from "@/components/AuditTemplates";
import { getOnboardingProgress } from "@/lib/onboarding";
import WorkspaceApiKeys from "@/components/WorkspaceApiKeys";
import BulkRedirectManager from "@/components/BulkRedirectManager";
import AuditAnalysisTools from "@/components/AuditAnalysisTools";
import AutonomousAgentQueue from "@/components/AutonomousAgentQueue";
import EcommerceCatalogPanel from "@/components/EcommerceCatalogPanel";
import WorkspaceGovernanceSettings from "@/components/WorkspaceGovernanceSettings";
import ScheduledReportSettings from "@/components/ScheduledReportSettings";
import { canWorkspace } from "@/lib/rbac";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { AiVisibilityInsights } from "@/components/ai-visibility-insights";
import { WorkspaceOperatingMetrics, OperatingMetricsSkeleton } from "@/components/workspace-operating-metrics";
import ProductionReadinessPanel from "@/components/production-readiness-panel";

function HistoryLoading() {
  return <main className="min-h-screen bg-[#07090E] px-5 py-10 text-white sm:px-8 sm:py-14" role="status" aria-label="Loading your command center"><div className="h-8 w-52 animate-pulse rounded-lg bg-white/10" /><div className="mt-8 grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div><span className="sr-only">Loading your audit history...</span></main>;
}

function MetricCards({ audits, rescued, deployments, citations, activeWorkspaces }: { audits: UserAuditHistoryItem[]; rescued: number | null; deployments: number | null; citations: number | null; activeWorkspaces: number }) {
  const metrics = historyMetrics(audits);
  const health = audits.length ? Math.max(0, 100 - metrics.active404s) : null;
  const verifiedScores = audits.filter(audit => hasVerifiedMatrix(audit.engine_matrix_json) && typeof audit.share_of_model_score === "number");
  const comparison = verifiedScores.length ? compareCategoryCitationRanks(verifiedScores[0].engine_matrix_json) : null;
  const singleDomain = new Set(audits.map(audit => audit.domain)).size === 1;
  const confirmed404Trend = singleDomain ? [...audits].reverse().slice(-8).map(audit => (audit.broken_links ?? []).filter(link => link.http_status === 404).length) : [];
  const cards = [
    { label: "AI Citation Health Score", value: health === null ? "—" : `${health}%`, detail: "100 minus unresolved saved 404s; citations are not stored" },
    { label: "Own-Domain 404s Caught", value: metrics.active404s, detail: "Confirmed in latest audit per domain", icon: confirmed404Trend.length > 1 ? <SparklineChart label="404 findings across saved audits" values={confirmed404Trend} /> : undefined },
    { label: "AI VISITORS RESCUED (30D)", value: rescued ?? "—", detail: rescued === null ? "Rescue telemetry unavailable" : `$${(rescued * 15).toLocaleString()} estimated pipeline at $15 per click` },
    { label: "SHARE OF MODEL (SoM %)", value: verifiedScores.length ? `${Math.round(verifiedScores.reduce((sum, audit) => sum + (audit.share_of_model_score ?? 0), 0) / verifiedScores.length)}%` : "—", detail: comparison ? `Latest audit: rank #${comparison.rank} of ${comparison.participants}; ${comparison.topCompetitor} cited in ${comparison.topCompetitorSlots} of ${comparison.totalSlots} modeled slots. Competitor URLs are not live-verified.` : "Modeled profiles; older results require a new audit" },
  ];
  const northStar = deployments === null ? "—" : (deployments / Math.max(activeWorkspaces, 1)).toFixed(2);
  return <><section aria-label="Live telemetry" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <MetricCard key={card.label} label={card.label} value={typeof card.value === "number" ? card.value.toLocaleString() : card.value} detail={card.detail} icon={card.icon} />)}</section><section aria-label="Verified AI Search Recoveries per Active Workspace" className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-sm font-semibold text-white">Verified AI Search Recoveries per Active Workspace</h2><p className="mt-1 text-xs text-slate-400">Evidence milestones shown separately; an HTTP deployment does not imply an AI citation.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Recoveries / Active Workspace" value={northStar} detail={`${activeWorkspaces} owned domain${activeWorkspaces === 1 ? "" : "s"}; technical deployments divided by workspaces`} /><MetricCard label="Technical Deployments Verified" value={deployments === null ? "—" : deployments.toLocaleString()} detail="Production redirect and destination checks passed" /><MetricCard label="Subsequent AI Citations Observed" value={citations === null ? "—" : citations.toLocaleString()} detail="A later saved observation cited the canonical URL" /><MetricCard label="Rescued Pixel Visits (30D)" value={rescued === null ? "—" : rescued.toLocaleString()} detail="Live rescue telemetry; $15/click pipeline is an estimate" /></div></section></>;
}

function HistoryUnavailable() {
  return <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-100"><h2 className="font-semibold">Audit history is not ready</h2><p className="mt-2 text-sm leading-6">Apply `supabase/migrations/002_audit_user_ownership.sql` in the Supabase SQL Editor, then reload this page.</p></div>;
}

function ruleKey(value: string): string | null {
  try { const url = new URL(value); return `${url.hostname.toLowerCase()}:${url.pathname}`; }
  catch { return null; }
}

function AuditCard({ audit, isPro, activeRules, syncedLinks, gap, canApprove }: { gap?: CitationGap; audit: UserAuditHistoryItem; isPro: boolean | null; activeRules: Set<string>; syncedLinks: string[]; canApprove:boolean }) {
  const brokenLinks = audit.broken_links ?? [];
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="break-all text-lg font-semibold">{audit.domain}</h2>
          <p className="mt-1 text-xs text-slate-500">{new Date(audit.created_at).toLocaleString()}</p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">{audit.status}</span>
      </div>
      <p className="mt-4 text-xs text-slate-400">Anyone with the report link can view its findings.</p><Link href={`/audit/${audit.id}`} className="mt-2 inline-block text-sm font-medium text-emerald-300 hover:underline">Open shareable report &rarr;</Link><p className="mt-5 text-sm text-slate-400">{brokenLinks.length} confirmed broken link{brokenLinks.length === 1 ? "" : "s"}</p>
      {brokenLinks.length > 0 && (
        <details className="mt-4 border-t border-white/10 pt-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-200">View broken links and redirect suggestions</summary>
          <ul className="mt-3 space-y-3">
            {brokenLinks.map((link) => (
              <li key={link.id} className="rounded-lg bg-black/20 p-3 text-xs">
                <p className="break-all font-medium text-slate-200">{link.cited_url} <span className="text-rose-300">HTTP {link.http_status}</span></p>
                {link.suggested_redirect && <p className="mt-2 break-all text-emerald-300">Suggested destination: {link.suggested_redirect}</p>}
                {canApprove && link.http_status === 404 && <RecoveryApprovalControls linkId={link.id} suggestedRedirect={link.suggested_redirect} approvalStatus={link.approval_status} approvedBy={link.approved_by} confidence={link.match_confidence} evidence={link.match_evidence_reason} />}
                {canApprove && link.http_status === 404 && link.suggested_redirect && ["approved", "deployed"].includes(link.approval_status) && ruleKey(link.cited_url) && <PublishRedirect linkId={link.id} initiallyActive={activeRules.has(ruleKey(link.cited_url)!)} isPro={isPro} />}
                {canApprove && link.http_status === 404 && link.suggested_redirect && ["approved", "deployed"].includes(link.approval_status) && <div className="mt-2"><RedirectSyncButton domains={[audit.domain]} linkId={link.id} auditId={audit.id} initiallySynced={syncedLinks.includes(link.id)} /></div>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {Array.isArray(audit.engine_matrix_json) && audit.engine_matrix_json.length > 0 && <section className="mt-5 border-t border-white/10 pt-4" aria-label="Multi-engine citation matrix"><h3 className="text-sm font-semibold text-white">Multi-Engine Citation Matrix <span className="text-slate-400">· Buyer Prompt Breakdown</span></h3><p className="mt-1 text-xs text-slate-500">Separate synthesis profiles share Tavily grounding; they do not query the named engines directly.</p><div className="mt-3 space-y-3">{[...new Set((audit.engine_matrix_json as EngineMatrixRow[]).map(row => row.prompt))].map(prompt => <div key={prompt} className="rounded-lg bg-black/20 p-3"><p className="text-xs font-medium text-slate-200">{prompt}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{ENGINE_PROFILES.map(engine => { const row = (audit.engine_matrix_json as EngineMatrixRow[]).find(item => item.prompt === prompt && item.engine === engine); if (!row) return null; const label = describeEngineStatus(row); return <div key={engine} className="rounded-md border border-white/5 p-2 text-xs"><p className="font-medium text-slate-300">{engine}</p><p className="mt-1 text-slate-400">{label}</p>{row.provider && <small>{row.provider}</small>}{row.citedUrl && <a className="mt-1 block break-all text-emerald-300 hover:underline" href={row.citedUrl} target="_blank" rel="noreferrer">{row.citedUrl}</a>}</div>; })}</div><div className="mt-2 flex flex-wrap gap-2 text-[11px]"><Link href="/#audit" className="rounded border border-emerald-400/20 px-2 py-1 text-emerald-300">⚡ Generate Capsule to Win Engine</Link><Link href="/dashboard/pixel" className="rounded border border-white/10 px-2 py-1 text-slate-300">🛠️ View Active 301 Recovery</Link><a href="#recovery-command" className="rounded border border-white/10 px-2 py-1 text-slate-300">🔥 View Reddit Source Thread</a></div></div>)}</div></section>}
      {gap && <div id="citation-gaps"><CitationGapPanel domain={audit.domain} gap={gap} /></div>}
    </article>
  );
}

async function UserAuditHistory({ searchParams }: { searchParams: Promise<{ domain?: string | string[] }> }) {
  const session = await auth(); const userId=session.userId;
  if (!userId) redirect("/");
  let access;try{access=await resolveWorkspaceAccess(createServerDatabase(),userId,session.orgId??null,session.orgRole??null)}catch{return <HistoryUnavailable/>}
  const ownerIds=access.ownerUserIds;const canApprove=canWorkspace(access.role,"approve_redirect");const canManageSettings=canWorkspace(access.role,"manage_integrations");const canManageOwnerSettings=canWorkspace(access.role,"manage_api_keys");

  let isPro: boolean | null = null;
  try { isPro = await hasProSubscription(ownerIds[0]); } catch {}

  let audits: UserAuditHistoryItem[];
  try { audits = await getUserAuditHistory(userId,ownerIds); }
  catch { return <HistoryUnavailable />; }
  const allDomains = [...new Set(audits.map(audit => audit.domain))];
  const requestedDomain = (await searchParams).domain;
  const selectedDomain = typeof requestedDomain === "string" && allDomains.includes(requestedDomain) ? requestedDomain : "";
  if (selectedDomain) audits = audits.filter(audit => audit.domain === selectedDomain);
  const latestReport = audits.find(audit => ["completed", "partial", "mock_completed"].includes(audit.status));

  let gaps = new Map<string, CitationGap>();
  try { gaps = await getAuditCitationGaps(ownerIds); } catch {}

  let activeRules = new Set<string>();
  let syncedLinks: string[] = [];
  let rescued: number | null = null;
  let deploymentCount: number | null = null;
  let citationCount: number | null = null;
  try {
    const domains = [...new Set(audits.map(audit => audit.domain))];
    if (!domains.length) rescued = 0;
    else {
      const result = await createServerDatabase().from("rescued_ai_visits").select("id", { count: "exact", head: true }).in("domain", domains).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
      if (!result.error) rescued = result.count ?? 0;
    }
  } catch {}
  let exportRules: { source_path: string; target_url: string }[] = [];
  let opportunities: { id: string; audit_id: string | null; domain: string; opportunity_type: string; prompt_query: string; target_url: string; dead_competitor_url: string | null; competitor_domain: string | null; http_status: number | null; matched_user_live_url: string | null; similarity_score: number | null; contact_email_or_link: string | null; outreach_draft: string | null; corrective_schema_json: string | null; verification_status: string | null; lifecycle_stage: "discovered" | "reviewed" | "contacted" | "replied" | "link_updated" | "ai_citation_observed"; relevance_score: number; buyer_intent_score: number; citation_evidence_score: number; replacement_quality_score: number; composite_priority_score: number }[] = [];
  let actionLogs: { id: string; workspace_domain: string; actor_user_id: string; action_type: string; target_url: string | null; safety_check_passed: boolean; created_at: string }[] = [];
  let onboarding: OnboardingProgress = getOnboardingProgress({ ownedDomains: allDomains.length, savedAudit: audits.some((audit) => ["completed", "partial"].includes(audit.status)), approvedRecovery: audits.some(audit => audit.broken_links.some(link => ["approved", "deployed"].includes(link.approval_status))), technicalDeploymentVerified: false });
  try {
    const db = createServerDatabase();
    const domains = [...new Set(audits.map((audit) => audit.domain))];
    const auditIds = audits.map(audit => audit.id);
    if (auditIds.length) {
      const outcomes = await db.from("recovery_outcomes").select("technical_deployment_verified_at,ai_citation_observed_at").in("audit_id", auditIds);
      if (!outcomes.error) {
        deploymentCount = (outcomes.data ?? []).filter(row => row.technical_deployment_verified_at).length;
        citationCount = (outcomes.data ?? []).filter(row => row.ai_citation_observed_at).length;
        onboarding.resultVerified = deploymentCount > 0;
      }
    } else { deploymentCount = 0; citationCount = 0; }
    const [rulesResult, cmsResult, llmsResult, webhookResult, eventResult, opportunityResult, actionLogResult] = await Promise.all([
      db.from("redirect_rules").select("source_host,source_path,target_url,synced_to_cms,source_link_id").in("user_id", ownerIds).eq("active", true).eq("is_active", true).limit(500),
      db.from("cms_connections").select("id").in("user_id", ownerIds).eq("platform", "shopify").limit(1),
      db.from("audits").select("id").in("user_id", ownerIds).not("llms_txt_content", "is", null).limit(1),
      db.from("audits").select("id").in("user_id", ownerIds).not("webhook_url", "is", null).limit(1),
      domains.length ? db.from("ai_404_events").select("id").in("domain", domains).limit(1) : Promise.resolve({ data: [], error: null }),
      auditIds.length ? db.from("citation_hijack_opportunities").select("id,audit_id,domain,opportunity_type,prompt_query,target_url,dead_competitor_url,competitor_domain,http_status,matched_user_live_url,similarity_score,contact_email_or_link,outreach_draft,corrective_schema_json,verification_status,lifecycle_stage,relevance_score,buyer_intent_score,citation_evidence_score,replacement_quality_score,composite_priority_score").in("audit_id", auditIds).order("composite_priority_score", { ascending: false }).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(500) : Promise.resolve({ data: [], error: null }),
      domains.length ? db.from("action_audit_logs").select("id,workspace_domain,actor_user_id,action_type,target_url,safety_check_passed,created_at").in("workspace_domain", domains).eq("actor_user_id", userId).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
    ]);
    if (rulesResult.error || cmsResult.error || llmsResult.error || webhookResult.error || eventResult.error || opportunityResult.error || actionLogResult.error) throw rulesResult.error ?? cmsResult.error ?? llmsResult.error ?? webhookResult.error ?? eventResult.error ?? opportunityResult.error ?? actionLogResult.error;
    const rules = (rulesResult.data ?? []).filter(rule => !selectedDomain || rule.source_host === selectedDomain);
    activeRules = new Set(rules.map((rule) => `${rule.source_host}:${rule.source_path}`));
    syncedLinks = rules.filter(rule => rule.synced_to_cms && rule.source_link_id).map(rule => rule.source_link_id!);
    exportRules = rules.map((rule) => ({ source_path: rule.source_path, target_url: rule.target_url }));
    const savedOpportunities = opportunityResult.data ?? [];
    actionLogs = actionLogResult.data ?? [];
    const lifecycleRows = savedOpportunities.map(item => ({ ...item, lifecycle_stage: item.lifecycle_stage as "discovered" | "reviewed" | "contacted" | "replied" | "link_updated" | "ai_citation_observed" }));
    const visibleByAudit = new Map<string, number>();
    opportunities = isPro ? lifecycleRows : lifecycleRows.map(item => {
      const auditId = item.audit_id ?? "unlinked";
      const position = visibleByAudit.get(auditId) ?? 0;
      visibleByAudit.set(auditId, position + 1);
      return position < 2 ? item : {
        ...item,
        target_url: "🔒 Upgrade to Pro to unlock hijack target",
        dead_competitor_url: "🔒 Upgrade to Pro to unlock hijack target",
        contact_email_or_link: "🔒 Upgrade to Pro to unlock hijack target",
      };
    });
    onboarding = {
      ...onboarding,
      ...getOnboardingProgress({ ownedDomains: domains.length, savedAudit: audits.some(audit => ["completed", "partial"].includes(audit.status)), approvedRecovery: audits.some(audit => audit.broken_links.some(link => ["approved", "deployed"].includes(link.approval_status))), technicalDeploymentVerified: onboarding.resultVerified }),
    };
  } catch {}

  return (
    <main className="min-h-screen bg-[#07090E] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
      <Sidebar items={[{ label: "Overview", href: "/dashboard#overview", active: true }, { label: "AI Scanner", href: "/dashboard#ai-scanner" }, { label: "Recovery Center", href: "/dashboard#recovery-command" }, { label: "Traffic Interceptor", href: "/dashboard/pixel" }, { label: "Competitor Intelligence", href: "/dashboard#competitor-intelligence" }, { label: "Outreach", href: "/dashboard#outreach" }, { label: "GEO Optimizer", href: "/dashboard#geo-optimizer" }, { label: "AI Visibility", href: "/dashboard#ai-visibility" }, { label: "Reports", href: "/dashboard#audit-history" }, { label: "Automations", href: "/dashboard#automations" }, { label: "Workspaces", href: "/dashboard#workspaces" }, ...(access.role==="owner"?[{label:"Billing",href:"/dashboard#billing"}]:[])]} />
      <div className="min-w-0 flex-1 px-5 py-8 sm:px-8 sm:py-10">
      <div id="overview"><PageHeader eyebrow={`${access.organizationId?`${access.role} organization member · `:""}Live telemetry · ${audits.length} saved scans`} title="Command Center" description="Monitor citations, recover links, and pursue hijack opportunities." actions={<><Link href="/" className="rounded-full px-3 py-2 text-xs font-medium text-slate-400 hover:text-white">Public site</Link><DomainSwitcher domains={allDomains} selected={selectedDomain} />{canApprove&&<RedirectSyncButton domains={[...new Set(audits.map(audit => audit.domain))]} />}<RedirectExportDrawer rules={exportRules} />{access.organizationId===null&&<Link href="/dashboard/pixel" className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-white/5">Pixel &amp; traffic</Link>}{canWorkspace(access.role,"scan")&&<Link href="/#audit" className="rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#07110d]">Run live audit</Link>}{access.role==="owner"&&<CheckoutButton />}<UserButton /></>} /></div>
      <OnboardingChecklist progress={onboarding} />
      <AuditTemplates />
      <MetricCards audits={audits} rescued={access.organizationId?null:rescued} deployments={deploymentCount} citations={citationCount} activeWorkspaces={new Set(audits.map(audit => audit.domain)).size} />
      <Suspense fallback={<OperatingMetricsSkeleton />}><WorkspaceOperatingMetrics domain={selectedDomain || allDomains[0] || ""} ownerUserIds={ownerIds} actorUserIds={[...new Set([...ownerIds, userId])]} organizationId={access.organizationId} /></Suspense>
      {latestReport && <section aria-label="Quick tools" className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4"><h2 className="text-sm font-semibold text-white">Quick Tools</h2><a href={`/audit/${latestReport.id}?print=1`} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-300">Export Report / Save as PDF</a><p className="mt-2 text-xs text-slate-500">Opens the latest report for {latestReport.domain}.</p></section>}
      {access.organizationId===null&&<AuditAnalysisTools auditId={latestReport?.id} />}
      <div id="ai-scanner" className="mb-3 scroll-mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-4"><h2 className="text-sm font-semibold">AI Scanner</h2><p className="mt-1 text-xs text-slate-400">Run a saved, search-grounded buyer prompt audit and review its recorded sources.</p>{canWorkspace(access.role,"scan")&&<Link href="/#audit" className="mt-2 inline-block text-xs text-emerald-300">Start an audit →</Link>}</div>
      <div id="recovery-command">{access.organizationId===null&&<AutonomousAgentQueue auditId={latestReport?.id} domain={latestReport?.domain ?? selectedDomain} recoveryLinks={(latestReport?.broken_links ?? []).map(link => ({ id: link.id, cited_url: link.cited_url, suggested_redirect: link.suggested_redirect, approval_status: link.approval_status, http_status: link.http_status }))} opportunities={opportunities.filter(item => item.audit_id === latestReport?.id).map(item => ({ id: item.id, prompt_query: item.prompt_query, opportunity_type: item.opportunity_type }))} />}{access.organizationId===null&&<EcommerceCatalogPanel domain={selectedDomain || allDomains[0] || ""} />}<div id="competitor-intelligence"><div id="outreach">{access.organizationId===null&&<OpportunityCommandCenter opportunities={opportunities} brokenLinks={audits.flatMap(audit => audit.broken_links.map(link => ({ ...link, auditId: audit.id, domain: audit.domain }))) } syncedLinks={syncedLinks} actionLogs={actionLogs} />}</div></div></div>
      <div id="automations">{access.organizationId===null&&<><WeeklyMonitoring isPro={isPro} /><AutonomousAgentQueue auditId={latestReport?.id} domain={latestReport?.domain ?? selectedDomain} recoveryLinks={(latestReport?.broken_links ?? []).map(link => ({ id: link.id, cited_url: link.cited_url, suggested_redirect: link.suggested_redirect, approval_status: link.approval_status, http_status: link.http_status }))} opportunities={opportunities.filter(item => item.audit_id === latestReport?.id).map(item => ({ id: item.id, prompt_query: item.prompt_query, opportunity_type: item.opportunity_type }))} /></>}</div>
      <div id="geo-optimizer"><div id="llms-txt-generator"><LlmsTxtGenerator domains={[...new Set(audits.map((audit) => audit.domain))]} /><p className="mt-3 rounded-xl border border-cyan-300/10 bg-cyan-300/[.035] p-4 text-xs leading-5 text-slate-400">llms.txt and structured data are machine-readable conventions that clarify your content. They are not guaranteed ranking or citation levers.</p><a href="#ecommerce-catalog" className="mt-3 inline-block text-sm text-emerald-300">Ecommerce Catalog &amp; SKU Recovery ↓</a></div></div>
      <div id="ai-visibility" className="mb-5 rounded-xl border border-white/10 bg-white/[0.02] p-4"><h2 className="text-sm font-semibold">AI Visibility</h2><p className="mt-1 text-xs text-slate-400">Share of Model and engine profiles appear on each saved audit report. Profile results are modeled from shared grounding sources.</p><AiVisibilityInsights domain={selectedDomain || allDomains[0] || ""} /></div>
      {canApprove&&<BulkRedirectManager domain={selectedDomain || allDomains[0] || ""} auditId={latestReport?.id} />}
      <p id="redirect-export" className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-slate-400">Pro users can publish or disable verified 301 suggestions below. Rules become active when the Cloudflare Worker is attached to the domain; edge lookups can retain a change for up to five seconds.</p>
      <div id="workspaces"><section className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4"><h2 className="text-sm font-semibold">Security Overview</h2><p className="mt-1 text-xs text-slate-400">Architecture, tenant isolation, SSRF, webhook, encryption, retention and incident response notes.</p><a href="/security-overview.md" download className="mt-3 inline-flex rounded-lg border border-emerald-300/30 px-3 py-2 text-xs font-semibold text-emerald-300">Download Security Overview</a>{access.role==="owner"&&<a href={`/api/workspaces/governance?domain=${encodeURIComponent(selectedDomain||allDomains[0]||"")}&action=export`} className="ml-3 inline-flex rounded-lg border border-white/10 px-3 py-2 text-xs">Export workspace data</a>}</section>{canManageSettings&&<ProductionReadinessPanel />}{canManageSettings&&<WorkspaceGovernanceSettings domain={selectedDomain||allDomains[0]||""} />}{canManageSettings&&<ScheduledReportSettings domain={selectedDomain||allDomains[0]||""} />}{canManageSettings&&<WorkspaceIntegrations key={`workspace-${selectedDomain}`} domains={[...new Set(audits.map(audit => audit.domain))]} />}{canManageOwnerSettings&&<WorkspaceApiKeys domains={[...new Set(audits.map(audit => audit.domain))]} />}{access.organizationId===null&&<AgencyProfileSettings key={`agency-${selectedDomain}`} domains={[...new Set(audits.map(audit => audit.domain))]} isPro={isPro} />}</div>
      {access.role==="owner"&&<div id="billing" className="mb-5 rounded-xl border border-white/10 bg-white/[0.02] p-4"><h2 className="text-sm font-semibold">Billing</h2><p className="mt-1 text-xs text-slate-400">Manage your current Pro or Agency subscription through the account checkout settings.</p><CheckoutButton /></div>}
      {audits.length ? <div id="audit-history" className="space-y-4">{audits.map((audit) => <AuditCard key={audit.id} audit={audit} gap={gaps.get(audit.id)} isPro={isPro} activeRules={activeRules} syncedLinks={syncedLinks} canApprove={canApprove} />)}</div> : <EmptyState title="No audits saved yet" description="Run an audit and it will appear here." action={<Link href="/#audit" className="inline-flex rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-[#07110d]">Run an audit</Link>} />}
      </div></div>
    </main>
  );
}

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ domain?: string | string[] }> }) {
  return <Suspense fallback={<HistoryLoading />}><UserAuditHistory searchParams={searchParams} /></Suspense>;
}
