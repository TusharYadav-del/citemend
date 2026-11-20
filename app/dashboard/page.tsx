import { Suspense } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getUserAuditHistory, type UserAuditHistoryItem } from "@/lib/audit-history";
import WeeklyMonitoring from "@/components/weekly-monitoring";
import { hasProSubscription } from "@/lib/subscription";
import { createServerDatabase } from "@/lib/supabase-server";
import { getAuditCitationGaps } from "@/lib/citation-gap-store";
import type { CitationGap } from "@/lib/citation-gap";
import CitationGapPanel from "@/components/citation-gap-panel";
import RedirectExportDrawer from "@/components/RedirectExportDrawer";
import LlmsTxtGenerator from "@/components/LlmsTxtGenerator";
import OnboardingChecklist, { type OnboardingProgress } from "@/components/OnboardingChecklist";
import OpportunityCommandCenter from "@/components/OpportunityCommandCenter";
import { ENGINE_PROFILES, describeEngineStatus, type EngineMatrixRow } from "@/lib/engine-matrix";
import RedirectSyncButton from "@/components/redirect-sync-button";
import WorkspaceIntegrations from "@/components/workspace-integrations";
import AgencyProfileSettings from "@/components/agency-profile-settings";
import DomainSwitcher from "@/components/domain-switcher";
import { PageHeader } from "@/components/ui/page-header";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertBanner } from "@/components/ui/alert-banner";
import { RetryButton } from "@/components/ui/retry-button";
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
import { HelpSupportDrawer } from "@/components/help-support-drawer";
import { BillingPanel } from "@/components/billing-panel";
import { RecoveryCenter, type RecoveryEvidence, type RecoveryOutcome } from "@/components/recovery-center";
import { CitationEvidenceImport } from "@/components/citation-evidence-import";
import { EvidenceCategoryBadge } from "@/components/evidence-category-badge";
import { ExtractabilityAuditPanel } from "@/components/ExtractabilityAuditPanel";
import type { SidebarItem } from "@/components/ui/sidebar";
import { RecoveryDeploymentTools } from "@/components/recovery-deployment-tools";
import ProvenanceAnalyticsPanel from "@/components/ProvenanceAnalyticsPanel";
import { AgencyWorkspaceHub } from "@/components/agency-workspace-hub";

function MetricCards({ rescued, deployments, citations, estimatedHours, findingsAvailable }: { rescued: number | null; deployments: number | null; citations: number | null; estimatedHours: number | null; findingsAvailable: boolean }) {
  const cards = [
    { label: "Redirects deployed & verified", value: deployments === null ? "Not measured" : deployments.toLocaleString(), detail: "Technical checks only; separate from later citation evidence.", tone: "verified" },
    { label: "AI citations re-observed", value: citations === null ? "Not measured" : citations.toLocaleString(), detail: "Saved later observation must include the canonical URL.", tone: "neutral" },
    { label: "Recovered AI referral visits Â· 30 days", value: rescued === null ? "Not measured" : rescued.toLocaleString(), detail: "Owner-tagged visits from connected rescue telemetry.", tone: "neutral" },
    { label: "Engineering & SEO hours saved", value: estimatedHours === null ? "Not measured" : `~${estimatedHours.toLocaleString()}h`, detail: "Estimate: 0.25 hours per handled finding; not tracked staff time.", tone: "estimate" },
  ];

  return <section aria-labelledby="outcomes-heading" className="mb-6 overflow-hidden rounded-xl border border-border bg-surface">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
      <div><p className="font-mono text-[10px] font-medium uppercase tracking-[.14em] text-accent">Evidence ledger / last 30 days</p><h2 id="outcomes-heading" className="mt-1 text-lg font-semibold text-foreground">Recovery outcomes</h2></div>
      <p className="max-w-md text-xs leading-5 text-text-tertiary">Deployment, citation observation, visits, and estimated time saved are reported as separate outcomes.</p>
    </div>
    {deployments === 0 && citations === 0 && <div className="px-5 pt-5"><EmptyState title="Your first audit starts here" description="Run a buyer-question audit to begin collecting URL and citation evidence." action={<Link href="/#audit" className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-xs font-semibold text-background">Run first audit</Link>} /></div>}
    <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
      {cards.map(card => <article key={card.label} className="min-w-0 px-5 py-5 sm:px-5 sm:py-6">
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium leading-5 text-text-secondary">{card.label}</p>{card.tone === "estimate" && <span className="shrink-0 rounded-sm border border-warning/25 bg-warning/5 px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-warning">Estimate</span>}{card.tone === "verified" && <span aria-label="Verified state" className="size-1.5 shrink-0 rounded-full bg-success" />}</div>
        <p data-metric className="mt-4 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-3xl">{card.value}</p><p className="mt-2 text-[11px] leading-5 text-text-tertiary">{card.detail}</p>
      </article>)}
    </div>
    <p className="border-t border-border px-5 py-3 text-xs text-text-tertiary sm:px-6">Revenue attribution: not measured in this workspace view.{findingsAvailable ? " Estimate is based on saved recovery findings." : " Recovery-finding data is unavailable; estimate is not calculated."}</p>
  </section>;
}
function HistoryUnavailable() {
  return <div className="m-6"><AlertBanner tone="danger" title="We couldn't load this workspace"><p>Your saved audits are temporarily unavailable. Try again in a moment.</p><RetryButton /></AlertBanner></div>;
}

function AuditCard({ audit, gap }: { gap?: CitationGap; audit: UserAuditHistoryItem }) {
  const brokenLinks = audit.broken_links ?? [];
  return (
    <article className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="break-all text-lg font-semibold">{audit.domain}</h2>
          <p className="mt-1 text-xs text-text-tertiary">{new Date(audit.created_at).toLocaleString()}</p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-accent">{audit.status}</span>
      </div>
      <p className="mt-4 text-xs text-text-secondary">Anyone with the report link can view its findings.</p><Link href={`/audit/${audit.id}`} className="mt-2 inline-block text-sm font-medium text-accent hover:underline">Open shareable report &rarr;</Link><p className="mt-5 text-sm text-text-secondary">{brokenLinks.filter(link => link.http_status === 404 || link.http_status === 410).length} confirmed broken destination{brokenLinks.filter(link => link.http_status === 404 || link.http_status === 410).length === 1 ? "" : "s"}</p>
      {brokenLinks.length > 0 && <a href="#recovery-command" className="mt-2 inline-block text-xs font-semibold text-accent hover:underline">Inspect these URLs in Recovery Center â†’</a>}
      {Array.isArray(audit.engine_matrix_json) && audit.engine_matrix_json.length > 0 && <section className="mt-5 border-t border-border pt-4" aria-label="Multi-engine citation matrix"><h3 className="text-sm font-semibold text-foreground">Multi-Engine Citation Matrix <span className="text-text-secondary">Â· Buyer Prompt Breakdown</span></h3><p className="mt-1 text-xs text-text-tertiary">Separate synthesis profiles share Tavily grounding; they do not query the named engines directly.</p><div className="mt-3 space-y-3">{[...new Set((audit.engine_matrix_json as EngineMatrixRow[]).map(row => row.prompt))].map(prompt => <div key={prompt} className="rounded-lg bg-surface-raised p-3"><p className="text-xs font-medium text-foreground">{prompt}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{ENGINE_PROFILES.map(engine => { const row = (audit.engine_matrix_json as EngineMatrixRow[]).find(item => item.prompt === prompt && item.engine === engine); if (!row) return null; const label = describeEngineStatus(row); return <div key={engine} className="rounded-md border border-border p-2 text-xs"><p className="font-medium text-text-secondary">{engine}</p><p className="mt-1 text-text-secondary">{label}</p><EvidenceCategoryBadge category="estimate" className="mt-1" />{row.provider && <small>{row.provider}</small>}{row.citedUrl && <a className="mt-1 block break-all text-accent hover:underline" href={row.citedUrl} target="_blank" rel="noreferrer">{row.citedUrl}</a>}</div>; })}</div><div className="mt-2 flex flex-wrap gap-2 text-[11px]"><Link href="/#audit" className="rounded border border-emerald-400/20 px-2 py-1 text-accent">âš¡ Generate Capsule to Win Engine</Link><Link href="/dashboard/pixel" className="rounded border border-border px-2 py-1 text-text-secondary">ðŸ› ï¸ View Active 301 Recovery</Link><a href="#recovery-command" className="rounded border border-border px-2 py-1 text-text-secondary">ðŸ”¥ View Reddit Source Thread</a></div></div>)}</div></section>}
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
  const workspaceAudits = audits;
  const allDomains = [...new Set(audits.map(audit => audit.domain))];
  const params = await searchParams;
  const requestedDomain = params.domain;
  const selectedDomain = typeof requestedDomain === "string" && allDomains.includes(requestedDomain) ? requestedDomain : "";
  if (selectedDomain) audits = audits.filter(audit => audit.domain === selectedDomain);
  const latestReport = audits.find(audit => ["completed", "partial", "mock_completed"].includes(audit.status));

  let gaps = new Map<string, CitationGap>();
  try { gaps = await getAuditCitationGaps(ownerIds); } catch {}

  let activeRules = new Set<string>();
  let destinationRequestsServed: Record<string, number> = {};
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
  let recoveryFindings: { id: string; audit_id: string; domain: string; finding_type: string; normalized_path: string; signal_evidence: Record<string, unknown>; guardrail_classification: string; approval_status: string; suggested_target_url: string | null; created_at: string }[] = [];
  let recoveryFindingsAvailable = false;
  let estimatedHoursSaved: number | null = null;
  let recoveryEvidenceError = false;
  let onboarding: OnboardingProgress = getOnboardingProgress({ ownedDomains: allDomains.length, savedAudit: audits.some((audit) => ["completed", "partial"].includes(audit.status)), approvedRecovery: audits.some(audit => audit.broken_links.some(link => ["approved", "deployed"].includes(link.approval_status))), technicalDeploymentVerified: false });
  try {
    const db = createServerDatabase();
    const domains = [...new Set(audits.map((audit) => audit.domain))];
    const auditIds = audits.map(audit => audit.id);
    if (auditIds.length) {
      const [outcomes, evidenceResult, findingsResult] = await Promise.all([
        db.from("recovery_outcomes").select("audit_id,broken_link_id,technical_deployment_verified_at,ai_citation_observed_at").in("audit_id", auditIds).limit(500),
        db.from("ai_observation_evidence").select("id,audit_id,domain,prompt_query,prompt_version,provider,model_name,search_method,locale,raw_answer,extracted_urls_json,sample_size,observed_at").in("audit_id", auditIds).order("observed_at", { ascending: false }).limit(500),
        db.from("recovery_findings").select("id,audit_id,domain,finding_type,normalized_path,signal_evidence,guardrail_classification,approval_status,suggested_target_url,created_at").in("audit_id", auditIds).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(5000),
      ]);
      if (!outcomes.error) recoveryOutcomes = outcomes.data ?? [];
      if (!evidenceResult.error) recoveryEvidence = evidenceResult.data ?? [];
      else recoveryEvidenceError = true;
      if (!findingsResult.error) { recoveryFindings = findingsResult.data ?? []; recoveryFindingsAvailable = true; estimatedHoursSaved = recoveryFindings.filter(row => ["approved", "deployed", "verified", "resolved"].includes(row.approval_status)).length * 0.25; }
      if (!outcomes.error) {
        deploymentCount = (outcomes.data ?? []).filter(row => row.technical_deployment_verified_at).length;
        citationCount = (outcomes.data ?? []).filter(row => row.ai_citation_observed_at).length;
        onboarding.resultVerified = deploymentCount > 0;
      }
    } else { deploymentCount = 0; citationCount = 0; }
    const [rulesResult, cmsResult, llmsResult, webhookResult, eventResult, opportunityResult, actionLogResult] = await Promise.all([
      db.from("redirect_rules").select("source_host,source_path,target_url,synced_to_cms,source_link_id,hits_recovered").in("user_id", ownerIds).eq("active", true).eq("is_active", true).limit(500),
      db.from("cms_connections").select("id").in("user_id", ownerIds).eq("platform", "shopify").limit(1),
      db.from("audits").select("id").in("user_id", ownerIds).not("llms_txt_content", "is", null).limit(1),
      db.from("audits").select("id").in("user_id", ownerIds).not("webhook_url", "is", null).limit(1),
      domains.length ? db.from("ai_404_events").select("id").in("domain", domains).limit(1) : Promise.resolve({ data: [], error: null }),
      auditIds.length ? db.from("citation_hijack_opportunities").select("id,audit_id,domain,opportunity_type,prompt_query,target_url,dead_competitor_url,competitor_domain,http_status,matched_user_live_url,similarity_score,contact_email_or_link,outreach_draft,corrective_schema_json,source_page_url,failed_destination_url_key,replacement_snippet,wayback_snapshot_json,verification_status,lifecycle_stage,relevance_score,buyer_intent_score,citation_evidence_score,replacement_quality_score,composite_priority_score").in("audit_id", auditIds).order("composite_priority_score", { ascending: false }).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(500) : Promise.resolve({ data: [], error: null }),
      domains.length ? db.from("action_audit_logs").select("id,workspace_domain,actor_user_id,action_type,target_url,safety_check_passed,created_at").in("workspace_domain", domains).eq("actor_user_id", userId).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
    ]);
    if (rulesResult.error || cmsResult.error || llmsResult.error || webhookResult.error || eventResult.error || opportunityResult.error || actionLogResult.error) throw rulesResult.error ?? cmsResult.error ?? llmsResult.error ?? webhookResult.error ?? eventResult.error ?? opportunityResult.error ?? actionLogResult.error;
    const rules = (rulesResult.data ?? []).filter(rule => !selectedDomain || rule.source_host === selectedDomain);
    activeRules = new Set(rules.map((rule) => `${rule.source_host}:${rule.source_path}`));
    syncedLinks = rules.filter(rule => rule.synced_to_cms && rule.source_link_id).map(rule => rule.source_link_id!);
    destinationRequestsServed = Object.fromEntries(rules.filter(rule => rule.source_link_id).map(rule => [rule.source_link_id!, rule.hits_recovered ?? 0]));
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
        target_url: "ðŸ”’ Upgrade to Pro to unlock outreach opportunity",
        dead_competitor_url: "ðŸ”’ Upgrade to Pro to unlock outreach opportunity",
        contact_email_or_link: "ðŸ”’ Upgrade to Pro to unlock outreach opportunity",
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
    ...(isFounder ? [{ label: "AI Outreach", href: "/dashboard/ai-outreach" }] : []),
  ];
  const recoveryRows = audits.flatMap(audit => audit.broken_links.map(link => ({ ...link, auditId: audit.id, domain: audit.domain, auditCreatedAt: audit.created_at })));
  const priorityRows = recoveryRows.filter(row => row.approval_status === "pending_review").slice(0, 4);
  return (
    <DashboardShell items={navItems}>
      <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-w-0 grid-cols-12 gap-x-4 px-4 py-6 sm:px-6 sm:py-8">
      <div className="col-span-12">
      <div id="overview" className="scroll-mt-8">
        <PageHeader eyebrow={`${access.organizationId ? `${access.role} organization member Â· ` : ""}Live telemetry Â· ${audits.length} saved scans`} title="Command Center" description="Monitor citations, recover links, and review Replacement Content Opportunities." actions={<><CommandPalette key={selectedDomain} items={navItems} domains={allDomains} selectedDomain={selectedDomain} canScan={canWorkspace(access.role, "scan")} canApprove={canApprove} latestAuditId={latestReport?.id} /><BackgroundJobsPanel domain={selectedDomain || undefined} /><HelpSupportDrawer workspaceDomain={selectedDomain || undefined} latestAuditId={latestReport?.id} /><UserButton /></>} />
        <div className="mb-6 grid gap-3 rounded-xl border border-border bg-surface p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2"><DomainSwitcher domains={allDomains} selected={selectedDomain} label={allDomains.length > 1 ? "Client workspace" : "Workspace"} /><WorkspaceModeSwitcher role={access.role} ecommerceAvailable={access.organizationId === null} /><span className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" /><span className="min-w-0 truncate font-mono text-[11px] text-text-tertiary">{selectedDomain || allDomains[0] || "No domain connected"}</span></div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {canWorkspace(access.role, "scan") && <Link href="/#audit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-xs font-semibold text-background">Run live audit</Link>}
            <details className="relative"><summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-md border border-border-strong bg-white/[.04] px-3 text-xs font-medium text-foreground hover:bg-white/[.08]">Workspace actions</summary><div className="absolute right-0 z-20 mt-2 grid min-w-56 gap-1 rounded-lg border border-border bg-surface-raised p-2 shadow-panel">
              {canApprove && <RedirectSyncButton domains={[...new Set(audits.map(audit => audit.domain))]} />}
              <RedirectExportDrawer rules={exportRules} />
              {access.organizationId === null && <Link href="/dashboard/pixel" className="rounded-md px-3 py-2 text-xs text-text-secondary hover:bg-surface-soft hover:text-foreground">Pixel &amp; traffic</Link>}
              {access.role === "owner" && <Link href="#billing" className="rounded-md px-3 py-2 text-xs text-text-secondary hover:bg-surface-soft hover:text-foreground">Plans &amp; billing</Link>}
              <Link href="/" className="rounded-md px-3 py-2 text-xs text-text-secondary hover:bg-surface-soft hover:text-foreground">Public site</Link>
            </div></details>
          </div>
        </div>
      </div>
      <section aria-labelledby="priority-queue-heading" className="mb-6 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4 sm:px-6"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-warning">Action queue Â· human review</p><h2 id="priority-queue-heading" className="mt-1 text-lg font-semibold">Needs your attention</h2></div><Link href="#recovery-command" className="text-xs font-medium text-accent hover:underline">Open Recovery Center â†’</Link></div>
        {priorityRows.length ? <ul className="divide-y divide-border">{priorityRows.map(row => <li key={row.id} className="grid min-w-0 gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"><div className="min-w-0"><p className="break-all font-mono text-xs text-foreground">{row.cited_url}</p><p className="mt-1 text-[11px] text-text-tertiary">{row.domain} Â· HTTP {row.http_status ?? "unknown"} Â· awaiting human review</p></div><span className="w-fit rounded-sm border border-warning/25 bg-warning/5 px-2 py-1 font-mono text-[10px] text-warning">PENDING</span></li>)}</ul> : <div className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6"><div><p className="text-sm font-medium text-foreground">No pending recovery approvals</p><p className="mt-1 text-xs leading-5 text-text-secondary">{recoveryEvidenceError ? "Evidence could not be loaded just now; retry the workspace to refresh the queue." : "New human-review items will appear here when saved audit evidence needs a decision."}</p></div><Link href="/#audit" className="inline-flex min-h-9 items-center justify-center rounded-md border border-border-strong bg-white/[.04] px-3 text-xs font-medium text-foreground hover:bg-white/[.08]">Run an audit</Link></div>}
      </section>
      <OnboardingChecklist progress={onboarding} />
      <AuditTemplates />
      <AgencyWorkspaceHub audits={workspaceAudits} selectedDomain={selectedDomain} />
      <MetricCards rescued={access.organizationId ? null : rescued} deployments={deploymentCount} citations={citationCount} estimatedHours={estimatedHoursSaved} findingsAvailable={recoveryFindingsAvailable} />
      <Suspense fallback={<OperatingMetricsSkeleton />}><WorkspaceOperatingMetrics domain={selectedDomain || allDomains[0] || ""} ownerUserIds={ownerIds} actorUserIds={[...new Set([...ownerIds, userId])]} organizationId={access.organizationId} /></Suspense>
      {(latestReport || selectedDomain || allDomains.length > 0) && <section aria-label="Quick tools" className="mb-6 rounded-xl border border-border bg-surface-raised p-4"><h2 className="text-sm font-semibold text-foreground">Quick Tools</h2>{latestReport && <a href={`/audit/${latestReport.id}?print=1`} target="_blank" rel="noreferrer" className="mt-3 mr-2 inline-flex rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-accent">Export Audit / Save as PDF</a>}<a href={`/dashboard/reports/monthly?domain=${encodeURIComponent(selectedDomain || latestReport?.domain || allDomains[0] || "")}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-accent">Monthly Recovery Report / Save as PDF</a><p className="mt-2 text-xs text-text-tertiary">The monthly report follows the selected client workspace and can be saved from the browser print dialog.</p></section>}
      {access.organizationId===null&&<AuditAnalysisTools auditId={latestReport?.id} />}
      <div id="ai-scanner" className="mb-3 scroll-mt-8 rounded-xl border border-border bg-surface p-4"><h2 className="text-sm font-semibold">AI Scanner</h2><p className="mt-1 text-xs text-text-secondary">Run a saved, search-grounded buyer prompt audit and review its recorded sources.</p>{canWorkspace(access.role,"scan")&&<Link href="/#audit" className="mt-2 inline-block text-xs text-accent">Start an audit â†’</Link>}<div className="mt-4"><CitationEvidenceImport auditId={latestReport?.id} domain={selectedDomain || latestReport?.domain} /></div></div>
      <RecoveryCenter rows={recoveryRows} evidence={recoveryEvidence} outcomes={recoveryOutcomes} logs={actionLogs} canApprove={canApprove} isPro={isPro} activeRules={[...activeRules]} syncedLinks={syncedLinks} pendingOnly={params.recovery === "pending"} evidenceError={recoveryEvidenceError} destinationRequestsServed={destinationRequestsServed} auditId={latestReport?.id} workspaceDomain={selectedDomain || latestReport?.domain} />
      {access.organizationId === null && <EcommerceCatalogPanel domain={selectedDomain || allDomains[0] || ""} />}
      <section id="competitor-intelligence" className="scroll-mt-8"><div id="outreach">{access.organizationId === null && <OpportunityCommandCenter opportunities={opportunities} brokenLinks={recoveryRows} syncedLinks={syncedLinks} actionLogs={actionLogs} />}</div></section>
      <div id="automations">{access.organizationId===null&&<><WeeklyMonitoring isPro={isPro} /><AutonomousAgentQueue auditId={latestReport?.id} domain={latestReport?.domain ?? selectedDomain} recoveryLinks={(latestReport?.broken_links ?? []).map(link => ({ id: link.id, cited_url: link.cited_url, suggested_redirect: link.suggested_redirect, approval_status: link.approval_status, http_status: link.http_status }))} opportunities={opportunities.filter(item => item.audit_id === latestReport?.id).map(item => ({ id: item.id, prompt_query: item.prompt_query, opportunity_type: item.opportunity_type }))} /></>}</div>
      <div id="geo-optimizer"><ExtractabilityAuditPanel auditId={latestReport?.id} /><div id="llms-txt-generator"><LlmsTxtGenerator domains={[...new Set(audits.map((audit) => audit.domain))]} /><p className="mt-3 rounded-xl border border-accent/10 bg-accent/[.035] p-4 text-xs leading-5 text-text-secondary">llms.txt and structured data are machine-readable conventions that clarify your content. They are not guaranteed ranking or citation levers.</p><a href="#ecommerce-catalog" className="mt-3 inline-block text-sm text-accent">Ecommerce Catalog &amp; SKU Recovery â†“</a></div></div>
      <ProvenanceAnalyticsPanel domain={selectedDomain || latestReport?.domain || allDomains[0]} />
      <div id="ai-visibility" className="mb-5 rounded-xl border border-border bg-surface p-4"><h2 className="text-sm font-semibold">AI Visibility</h2><p className="mt-1 text-xs text-text-secondary">Share of Model and engine profiles appear on each saved audit report. Profile results are modeled from shared grounding sources.</p><AiVisibilityInsights domain={selectedDomain || allDomains[0] || ""} /></div>
      {canApprove&&<BulkRedirectManager domain={selectedDomain || allDomains[0] || ""} auditId={latestReport?.id} />}
      <p id="redirect-export" className="mb-6 rounded-xl border border-border bg-surface-raised p-4 text-xs leading-5 text-text-secondary">Pro users can publish or disable verified 301 suggestions below. Rules become active when the Cloudflare Worker is attached to the domain; edge lookups can retain a change for up to five seconds.</p>
      <RecoveryDeploymentTools domain={selectedDomain || latestReport?.domain || allDomains[0] || ""} findings={recoveryFindings.filter(row => !selectedDomain || row.domain === selectedDomain)} />
      <div id="workspaces"><AgencyReferralConversionTracker domain={selectedDomain||allDomains[0]||""} /><WorkspaceSettingsTabs settings={<><section className="mb-5 rounded-xl border border-border bg-surface-raised p-4"><h2 className="text-sm font-semibold">Security Overview</h2><p className="mt-1 text-xs text-text-secondary">Architecture, tenant isolation, SSRF, webhook, encryption, retention and incident response notes.</p><a href="/security-overview.md" download className="mt-3 inline-flex rounded-lg border border-emerald-300/30 px-3 py-2 text-xs font-semibold text-accent">Download Security Overview</a>{access.role==="owner"&&<a href={`/api/workspaces/governance?domain=${encodeURIComponent(selectedDomain||allDomains[0]||"")}&action=export`} className="ml-3 inline-flex rounded-lg border border-border px-3 py-2 text-xs">Export workspace data</a>}</section>{canManageSettings&&<ProductionReadinessPanel />}{canManageSettings&&<WorkspaceGovernanceSettings domain={selectedDomain||allDomains[0]||""} />}{canManageSettings&&<ScheduledReportSettings domain={selectedDomain||allDomains[0]||""} />}{canManageSettings&&<WorkspaceIntegrations key={`workspace-${selectedDomain}`} domains={[...new Set(audits.map(audit => audit.domain))]} />}{canManageOwnerSettings&&<WorkspaceApiKeys domains={[...new Set(audits.map(audit => audit.domain))]} />}{access.organizationId===null&&<AgencyProfileSettings key={`agency-${selectedDomain}`} domains={[...new Set(audits.map(audit => audit.domain))]} isPro={isPro} />}</>} partner={canManageSettings?<AgencyPartnerPanel key={selectedDomain || allDomains[0] || ""} domain={selectedDomain||allDomains[0]||""} domains={allDomains} />:<section id="agency-partner" className="rounded-xl border border-border bg-surface-raised p-5"><h2 className="text-sm font-semibold">Agency Partner Program</h2><p className="mt-2 text-xs leading-5 text-text-secondary">Workspace owner or admin access is required to create and manage partner referrals.</p></section>} /></div>
      {access.role === "owner" && <BillingPanel />}
      <section id="audit-history" className="mb-6 scroll-mt-8"><div className="mb-4"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">4 Â· Prove</p><h2 className="mt-1 text-xl font-semibold text-foreground">Reports</h2></div>{latestReport && canWorkspace(access.role, "draft") && <CaseStudyGenerator auditId={latestReport.id} />}{audits.length ? <div className="space-y-4">{audits.map(audit => <AuditCard key={audit.id} audit={audit} gap={gaps.get(audit.id)} />)}</div> : <EmptyState title="No audits saved yet" description="Run an audit and it will appear here." action={<Link href="/#audit" className="inline-flex rounded-full bg-accent px-5 py-3 text-sm font-semibold text-background">Run an audit</Link>} />}</section>
      </div></div>
      </main>
    </DashboardShell>
  );
}

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ domain?: string | string[]; recovery?: string | string[] }> }) {
  return <Suspense fallback={<DashboardLoading />}><UserAuditHistory searchParams={searchParams} /></Suspense>;
}

