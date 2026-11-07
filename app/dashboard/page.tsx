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
import { AlertBanner } from "@/components/ui/alert-banner";
import { RetryButton } from "@/components/ui/retry-button";
import { SparklineChart } from "@/components/ui/sparkline-chart";
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
import { CaseStudyGenerator } from "@/components/case-study-generator";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { AiVisibilityInsights } from "@/components/ai-visibility-insights";
import { WorkspaceOperatingMetrics, OperatingMetricsSkeleton } from "@/components/workspace-operating-metrics";
import ProductionReadinessPanel from "@/components/production-readiness-panel";
import { WorkspaceSettingsTabs } from "@/components/workspace-settings-tabs";
import { AgencyPartnerPanel } from "@/components/agency-partner-panel";
import { AgencyReferralConversionTracker } from "@/components/agency-referral-conversion-tracker";
import { parseFounderAllowlist } from "@/lib/founder-os";
import { BackgroundJobsPanel } from "@/components/background-jobs-panel";
import DashboardLoading from "./loading";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { WorkspaceModeSwitcher } from "@/components/ui/workspace-mode-switcher";
import { RecoveryCenter, type RecoveryEvidence, type RecoveryOutcome } from "@/components/recovery-center";
import type { SidebarItem } from "@/components/ui/sidebar";

function MetricCards({ audits, rescued, deployments, citations, activeWorkspaces }: { audits: UserAuditHistoryItem[]; rescued: number | null; deployments: number | null; citations: number | null; activeWorkspaces: number }) {
  if (!audits.length) return <div className="mb-6"><EmptyState title="Your first audit starts here" description="Connect a website and run one buyer prompt to establish your baseline." action={<Link href="/#audit" className="inline-flex min-h-10 items-center rounded-lg bg-emerald-300 px-4 text-xs font-semibold text-[#07110d]">Run first audit</Link>} /></div>;
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
  return <div className="m-6"><AlertBanner tone="danger" title="We couldn't load this workspace"><p>Your saved audits are temporarily unavailable. Try again in a moment.</p><RetryButton /></AlertBanner></div>;
}

function AuditCard({ audit, gap }: { gap?: CitationGap; audit: UserAuditHistoryItem }) {
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
      {brokenLinks.length > 0 && <a href="#recovery-command" className="mt-2 inline-block text-xs font-semibold text-emerald-300 hover:underline">Inspect these URLs in Recovery Center →</a>}
      {Array.isArray(audit.engine_matrix_json) && audit.engine_matrix_json.length > 0 && <section className="mt-5 border-t border-white/10 pt-4" aria-label="Multi-engine citation matrix"><h3 className="text-sm font-semibold text-white">Multi-Engine Citation Matrix <span className="text-slate-400">· Buyer Prompt Breakdown</span></h3><p className="mt-1 text-xs text-slate-500">Separate synthesis profiles share Tavily grounding; they do not query the named engines directly.</p><div className="mt-3 space-y-3">{[...new Set((audit.engine_matrix_json as EngineMatrixRow[]).map(row => row.prompt))].map(prompt => <div key={prompt} className="rounded-lg bg-black/20 p-3"><p className="text-xs font-medium text-slate-200">{prompt}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{ENGINE_PROFILES.map(engine => { const row = (audit.engine_matrix_json as EngineMatrixRow[]).find(item => item.prompt === prompt && item.engine === engine); if (!row) return null; const label = describeEngineStatus(row); return <div key={engine} className="rounded-md border border-white/5 p-2 text-xs"><p className="font-medium text-slate-300">{engine}</p><p className="mt-1 text-slate-400">{label}</p>{row.provider && <small>{row.provider}</small>}{row.citedUrl && <a className="mt-1 block break-all text-emerald-300 hover:underline" href={row.citedUrl} target="_blank" rel="noreferrer">{row.citedUrl}</a>}</div>; })}</div><div className="mt-2 flex flex-wrap gap-2 text-[11px]"><Link href="/#audit" className="rounded border border-emerald-400/20 px-2 py-1 text-emerald-300">⚡ Generate Capsule to Win Engine</Link><Link href="/dashboard/pixel" className="rounded border border-white/10 px-2 py-1 text-slate-300">🛠️ View Active 301 Recovery</Link><a href="#recovery-command" className="rounded border border-white/10 px-2 py-1 text-slate-300">🔥 View Reddit Source Thread</a></div></div>)}</div></section>}
      {gap && <div id="citation-gaps"><CitationGapPanel domain={audit.domain} gap={gap} /></div>}
    </article>
  );
}

async function UserAuditHistory({ searchParams }: { searchParams: Promise<{ domain?: string | string[]; recovery?: string | string[] }> }) {
  const session = await auth(); const userId=session.userId;
  if (!userId) redirect("/");
  let access;try{access=await resolveWorkspaceAccess(createServerDatabase(),userId,session.orgId??null,session.orgRole??null)}catch{return <HistoryUnavailable/>}
  const ownerIds=access.ownerUserIds;const canApprove=canWorkspace(access.role,"approve_redirect");const canManageSettings=canWorkspace(access.role,"manage_integrations");const canManageOwnerSettings=canWorkspace(access.role,"manage_api_keys");const isFounder=parseFounderAllowlist().includes(userId);

  let isPro: boolean | null = null;
  try { isPro = await hasProSubscription(ownerIds[0]); } catch {}

  let audits: UserAuditHistoryItem[];
  try { audits = await getUserAuditHistory(userId,ownerIds); }
  catch { return <HistoryUnavailable />; }
  const allDomains = [...new Set(audits.map(audit => audit.domain))];
  const params = await searchParams;
  const requestedDomain = params.domain;
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
  let recoveryEvidence: RecoveryEvidence[] = [];
  let recoveryOutcomes: RecoveryOutcome[] = [];
  let recoveryEvidenceError = false;
  let onboarding: OnboardingProgress = getOnboardingProgress({ ownedDomains: allDomains.length, savedAudit: audits.some((audit) => ["completed", "partial"].includes(audit.status)), approvedRecovery: audits.some(audit => audit.broken_links.some(link => ["approved", "deployed"].includes(link.approval_status))), technicalDeploymentVerified: false });
  try {
    const db = createServerDatabase();
    const domains = [...new Set(audits.map((audit) => audit.domain))];
    const auditIds = audits.map(audit => audit.id);
    if (auditIds.length) {
      const [outcomes, evidenceResult] = await Promise.all([
        db.from("recovery_outcomes").select("audit_id,broken_link_id,technical_deployment_verified_at,ai_citation_observed_at").in("audit_id", auditIds).limit(500),
        db.from("ai_observation_evidence").select("id,audit_id,domain,prompt_query,prompt_version,provider,model_name,search_method,locale,raw_answer,extracted_urls_json,sample_size,observed_at").in("audit_id", auditIds).order("observed_at", { ascending: false }).limit(500),
      ]);
      if (!outcomes.error) recoveryOutcomes = outcomes.data ?? [];
      if (!evidenceResult.error) recoveryEvidence = evidenceResult.data ?? [];
      else recoveryEvidenceError = true;
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

  const dashboardHref = selectedDomain ? `/dashboard?domain=${encodeURIComponent(selectedDomain)}` : "/dashboard";
  const navItems: SidebarItem[] = [
    { label: "Overview", href: `${dashboardHref}#overview` }, { label: "AI Scanner", href: `${dashboardHref}#ai-scanner` },
    { label: "Recovery Center", href: `${dashboardHref}#recovery-command` }, { label: "Traffic Interceptor", href: "/dashboard/pixel" },
    { label: "Competitor Intelligence", href: `${dashboardHref}#competitor-intelligence` }, { label: "Outreach", href: `${dashboardHref}#outreach` },
    { label: "GEO Optimizer", href: `${dashboardHref}#geo-optimizer` }, { label: "AI Visibility", href: `${dashboardHref}#ai-visibility` },
    { label: "Reports", href: `${dashboardHref}#audit-history` }, { label: "Automations", href: `${dashboardHref}#automations` },
    { label: "Workspaces", href: `${dashboardHref}#workspaces` },
    ...(access.role === "owner" ? [{ label: "Billing", href: `${dashboardHref}#billing` }] : []),
    ...(isFounder ? [{ label: "Founder OS", href: "/dashboard/founder-os" }] : []),
  ];
  const recoveryRows = audits.flatMap(audit => audit.broken_links.map(link => ({ ...link, auditId: audit.id, domain: audit.domain, auditCreatedAt: audit.created_at })));
  return (
    <main className="min-h-screen bg-[#07090E] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
      <Sidebar items={navItems} />
      <div className="grid min-w-0 flex-1 grid-cols-12 gap-x-4 px-4 py-6 sm:px-6 sm:py-8">
      <div className="col-span-12">
      <div id="overview" className="scroll-mt-8">
        <PageHeader eyebrow={`${access.organizationId ? `${access.role} organization member · ` : ""}Live telemetry · ${audits.length} saved scans`} title="Command Center" description="Monitor citations, recover links, and pursue hijack opportunities." actions={<><CommandPalette key={selectedDomain} items={navItems} domains={allDomains} selectedDomain={selectedDomain} canScan={canWorkspace(access.role, "scan")} canApprove={canApprove} latestAuditId={latestReport?.id} /><BackgroundJobsPanel domain={selectedDomain || undefined} /><UserButton /></>} />
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.02] p-3">
          <DomainSwitcher domains={allDomains} selected={selectedDomain} />
          <WorkspaceModeSwitcher role={access.role} ecommerceAvailable={access.organizationId === null} />
          {canApprove && <RedirectSyncButton domains={[...new Set(audits.map(audit => audit.domain))]} />}
          <RedirectExportDrawer rules={exportRules} />
          {access.organizationId === null && <Link href="/dashboard/pixel" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-white/5">Pixel &amp; traffic</Link>}
          {canWorkspace(access.role, "scan") && <Link href="/#audit" className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-[#07110d]">Run live audit</Link>}
          {access.role === "owner" && <CheckoutButton />}
          <Link href="/" className="px-3 py-2 text-xs text-slate-400 hover:text-white">Public site</Link>
        </div>
      </div>
      <OnboardingChecklist progress={onboarding} />
      <AuditTemplates />
      <MetricCards audits={audits} rescued={access.organizationId?null:rescued} deployments={deploymentCount} citations={citationCount} activeWorkspaces={new Set(audits.map(audit => audit.domain)).size} />
      <Suspense fallback={<OperatingMetricsSkeleton />}><WorkspaceOperatingMetrics domain={selectedDomain || allDomains[0] || ""} ownerUserIds={ownerIds} actorUserIds={[...new Set([...ownerIds, userId])]} organizationId={access.organizationId} /></Suspense>
      {latestReport && <section aria-label="Quick tools" className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4"><h2 className="text-sm font-semibold text-white">Quick Tools</h2><a href={`/audit/${latestReport.id}?print=1`} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-300">Export Report / Save as PDF</a><p className="mt-2 text-xs text-slate-500">Opens the latest report for {latestReport.domain}.</p></section>}
      {access.organizationId===null&&<AuditAnalysisTools auditId={latestReport?.id} />}
      <div id="ai-scanner" className="mb-3 scroll-mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-4"><h2 className="text-sm font-semibold">AI Scanner</h2><p className="mt-1 text-xs text-slate-400">Run a saved, search-grounded buyer prompt audit and review its recorded sources.</p>{canWorkspace(access.role,"scan")&&<Link href="/#audit" className="mt-2 inline-block text-xs text-emerald-300">Start an audit →</Link>}</div>
      <RecoveryCenter rows={recoveryRows} evidence={recoveryEvidence} outcomes={recoveryOutcomes} logs={actionLogs} canApprove={canApprove} isPro={isPro} activeRules={[...activeRules]} syncedLinks={syncedLinks} pendingOnly={params.recovery === "pending"} evidenceError={recoveryEvidenceError} />
      {access.organizationId === null && <EcommerceCatalogPanel domain={selectedDomain || allDomains[0] || ""} />}
      <section id="competitor-intelligence" className="scroll-mt-8"><div id="outreach">{access.organizationId === null && <OpportunityCommandCenter opportunities={opportunities} brokenLinks={recoveryRows} syncedLinks={syncedLinks} actionLogs={actionLogs} />}</div></section>
      <div id="automations">{access.organizationId===null&&<><WeeklyMonitoring isPro={isPro} /><AutonomousAgentQueue auditId={latestReport?.id} domain={latestReport?.domain ?? selectedDomain} recoveryLinks={(latestReport?.broken_links ?? []).map(link => ({ id: link.id, cited_url: link.cited_url, suggested_redirect: link.suggested_redirect, approval_status: link.approval_status, http_status: link.http_status }))} opportunities={opportunities.filter(item => item.audit_id === latestReport?.id).map(item => ({ id: item.id, prompt_query: item.prompt_query, opportunity_type: item.opportunity_type }))} /></>}</div>
      <div id="geo-optimizer"><div id="llms-txt-generator"><LlmsTxtGenerator domains={[...new Set(audits.map((audit) => audit.domain))]} /><p className="mt-3 rounded-xl border border-cyan-300/10 bg-cyan-300/[.035] p-4 text-xs leading-5 text-slate-400">llms.txt and structured data are machine-readable conventions that clarify your content. They are not guaranteed ranking or citation levers.</p><a href="#ecommerce-catalog" className="mt-3 inline-block text-sm text-emerald-300">Ecommerce Catalog &amp; SKU Recovery ↓</a></div></div>
      <div id="ai-visibility" className="mb-5 rounded-xl border border-white/10 bg-white/[0.02] p-4"><h2 className="text-sm font-semibold">AI Visibility</h2><p className="mt-1 text-xs text-slate-400">Share of Model and engine profiles appear on each saved audit report. Profile results are modeled from shared grounding sources.</p><AiVisibilityInsights domain={selectedDomain || allDomains[0] || ""} /></div>
      {canApprove&&<BulkRedirectManager domain={selectedDomain || allDomains[0] || ""} auditId={latestReport?.id} />}
      <p id="redirect-export" className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-slate-400">Pro users can publish or disable verified 301 suggestions below. Rules become active when the Cloudflare Worker is attached to the domain; edge lookups can retain a change for up to five seconds.</p>
      <div id="workspaces"><AgencyReferralConversionTracker domain={selectedDomain||allDomains[0]||""} /><WorkspaceSettingsTabs settings={<><section className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4"><h2 className="text-sm font-semibold">Security Overview</h2><p className="mt-1 text-xs text-slate-400">Architecture, tenant isolation, SSRF, webhook, encryption, retention and incident response notes.</p><a href="/security-overview.md" download className="mt-3 inline-flex rounded-lg border border-emerald-300/30 px-3 py-2 text-xs font-semibold text-emerald-300">Download Security Overview</a>{access.role==="owner"&&<a href={`/api/workspaces/governance?domain=${encodeURIComponent(selectedDomain||allDomains[0]||"")}&action=export`} className="ml-3 inline-flex rounded-lg border border-white/10 px-3 py-2 text-xs">Export workspace data</a>}</section>{canManageSettings&&<ProductionReadinessPanel />}{canManageSettings&&<WorkspaceGovernanceSettings domain={selectedDomain||allDomains[0]||""} />}{canManageSettings&&<ScheduledReportSettings domain={selectedDomain||allDomains[0]||""} />}{canManageSettings&&<WorkspaceIntegrations key={`workspace-${selectedDomain}`} domains={[...new Set(audits.map(audit => audit.domain))]} />}{canManageOwnerSettings&&<WorkspaceApiKeys domains={[...new Set(audits.map(audit => audit.domain))]} />}{access.organizationId===null&&<AgencyProfileSettings key={`agency-${selectedDomain}`} domains={[...new Set(audits.map(audit => audit.domain))]} isPro={isPro} />}</>} partner={canManageSettings?<AgencyPartnerPanel key={selectedDomain || allDomains[0] || ""} domain={selectedDomain||allDomains[0]||""} domains={allDomains} />:<section id="agency-partner" className="rounded-xl border border-white/10 bg-white/[.03] p-5"><h2 className="text-sm font-semibold">Agency Partner Program</h2><p className="mt-2 text-xs leading-5 text-slate-400">Workspace owner or admin access is required to create and manage partner referrals.</p></section>} /></div>
      {access.role==="owner"&&<div id="billing" className="mb-5 rounded-xl border border-white/10 bg-white/[0.02] p-4"><h2 className="text-sm font-semibold">Billing</h2><p className="mt-1 text-xs text-slate-400">Manage your current Pro or Agency subscription through the account checkout settings.</p><CheckoutButton /></div>}
      <section id="audit-history" className="mb-6 scroll-mt-8"><div className="mb-4"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-emerald-300">4 · Prove</p><h2 className="mt-1 text-xl font-semibold text-white">Reports</h2></div>{latestReport && canWorkspace(access.role, "draft") && <CaseStudyGenerator auditId={latestReport.id} />}{audits.length ? <div className="space-y-4">{audits.map(audit => <AuditCard key={audit.id} audit={audit} gap={gaps.get(audit.id)} />)}</div> : <EmptyState title="No audits saved yet" description="Run an audit and it will appear here." action={<Link href="/#audit" className="inline-flex rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-[#07110d]">Run an audit</Link>} />}</section>
      </div></div></div>
    </main>
  );
}

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ domain?: string | string[]; recovery?: string | string[] }> }) {
  return <Suspense fallback={<DashboardLoading />}><UserAuditHistory searchParams={searchParams} /></Suspense>;
}
