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

function HistoryLoading() {
  return <main className="min-h-screen bg-[#07090E] px-5 py-10 text-white sm:px-8 sm:py-14" role="status" aria-label="Loading your command center"><div className="h-8 w-52 animate-pulse rounded-lg bg-white/10" /><div className="mt-8 grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div><span className="sr-only">Loading your audit history...</span></main>;
}

function MetricCards({ audits, rescued }: { audits: UserAuditHistoryItem[]; rescued: number | null }) {
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
  return <section aria-label="Live telemetry" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <MetricCard key={card.label} label={card.label} value={typeof card.value === "number" ? card.value.toLocaleString() : card.value} detail={card.detail} icon={card.icon} />)}</section>;
}

function HistoryUnavailable() {
  return <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-100"><h2 className="font-semibold">Audit history is not ready</h2><p className="mt-2 text-sm leading-6">Apply `supabase/migrations/002_audit_user_ownership.sql` in the Supabase SQL Editor, then reload this page.</p></div>;
}

function ruleKey(value: string): string | null {
  try { const url = new URL(value); return `${url.hostname.toLowerCase()}:${url.pathname}`; }
  catch { return null; }
}

function AuditCard({ audit, isPro, activeRules, syncedLinks, gap }: { gap?: CitationGap; audit: UserAuditHistoryItem; isPro: boolean | null; activeRules: Set<string>; syncedLinks: string[] }) {
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
                {link.http_status === 404 && <RecoveryApprovalControls linkId={link.id} suggestedRedirect={link.suggested_redirect} approvalStatus={link.approval_status} confidence={link.match_confidence} evidence={link.match_evidence_reason} />}
                {link.http_status === 404 && link.suggested_redirect && ["approved", "deployed"].includes(link.approval_status) && ruleKey(link.cited_url) && <PublishRedirect linkId={link.id} initiallyActive={activeRules.has(ruleKey(link.cited_url)!)} isPro={isPro} />}
                {link.http_status === 404 && link.suggested_redirect && ["approved", "deployed"].includes(link.approval_status) && <div className="mt-2"><RedirectSyncButton domains={[audit.domain]} linkId={link.id} auditId={audit.id} initiallySynced={syncedLinks.includes(link.id)} /></div>}
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
  const { userId } = await auth();
  if (!userId) redirect("/");

  let isPro: boolean | null = null;
  try { isPro = await hasProSubscription(userId); } catch {}

  let audits: UserAuditHistoryItem[];
  try { audits = await getUserAuditHistory(userId); }
  catch { return <HistoryUnavailable />; }
  const allDomains = [...new Set(audits.map(audit => audit.domain))];
  const requestedDomain = (await searchParams).domain;
  const selectedDomain = typeof requestedDomain === "string" && allDomains.includes(requestedDomain) ? requestedDomain : "";
  if (selectedDomain) audits = audits.filter(audit => audit.domain === selectedDomain);
  const latestReport = audits.find(audit => ["completed", "partial", "mock_completed"].includes(audit.status));

  let gaps = new Map<string, CitationGap>();
  try { gaps = await getAuditCitationGaps(userId); } catch {}

  let activeRules = new Set<string>();
  let syncedLinks: string[] = [];
  let rescued: number | null = null;
  try {
    const domains = [...new Set(audits.map(audit => audit.domain))];
    if (!domains.length) rescued = 0;
    else {
      const result = await createServerDatabase().from("rescued_ai_visits").select("id", { count: "exact", head: true }).in("domain", domains).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
      if (!result.error) rescued = result.count ?? 0;
    }
  } catch {}
  let exportRules: { source_path: string; target_url: string }[] = [];
  let opportunities: { id: string; audit_id: string | null; domain: string; opportunity_type: string; prompt_query: string; target_url: string; dead_competitor_url: string | null; competitor_domain: string | null; http_status: number | null; matched_user_live_url: string | null; similarity_score: number | null; contact_email_or_link: string | null; outreach_draft: string | null; corrective_schema_json: string | null; verification_status: string | null }[] = [];
  let onboarding: OnboardingProgress = { firstAudit: audits.some((audit) => ["completed", "partial"].includes(audit.status)), redirects: false, llmsAndCapsule: false, recovery: false };
  try {
    const db = createServerDatabase();
    const domains = [...new Set(audits.map((audit) => audit.domain))];
    const auditIds = audits.map(audit => audit.id);
    const [rulesResult, cmsResult, llmsResult, webhookResult, eventResult, opportunityResult] = await Promise.all([
      db.from("redirect_rules").select("source_host,source_path,target_url,synced_to_cms,source_link_id").eq("user_id", userId).eq("active", true).eq("is_active", true).limit(500),
      db.from("cms_connections").select("id").eq("user_id", userId).eq("platform", "shopify").limit(1),
      db.from("audits").select("id").eq("user_id", userId).not("llms_txt_content", "is", null).limit(1),
      db.from("audits").select("id").eq("user_id", userId).not("webhook_url", "is", null).limit(1),
      domains.length ? db.from("ai_404_events").select("id").in("domain", domains).limit(1) : Promise.resolve({ data: [], error: null }),
      auditIds.length ? db.from("citation_hijack_opportunities").select("id,audit_id,domain,opportunity_type,prompt_query,target_url,dead_competitor_url,competitor_domain,http_status,matched_user_live_url,similarity_score,contact_email_or_link,outreach_draft,corrective_schema_json,verification_status").in("audit_id", auditIds).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(500) : Promise.resolve({ data: [], error: null }),
    ]);
    if (rulesResult.error || cmsResult.error || llmsResult.error || webhookResult.error || eventResult.error || opportunityResult.error) throw rulesResult.error ?? cmsResult.error ?? llmsResult.error ?? webhookResult.error ?? eventResult.error ?? opportunityResult.error;
    const rules = (rulesResult.data ?? []).filter(rule => !selectedDomain || rule.source_host === selectedDomain);
    activeRules = new Set(rules.map((rule) => `${rule.source_host}:${rule.source_path}`));
    syncedLinks = rules.filter(rule => rule.synced_to_cms && rule.source_link_id).map(rule => rule.source_link_id!);
    exportRules = rules.map((rule) => ({ source_path: rule.source_path, target_url: rule.target_url }));
    const savedOpportunities = opportunityResult.data ?? [];
    const visibleByAudit = new Map<string, number>();
    opportunities = isPro ? savedOpportunities : savedOpportunities.map(item => {
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
      redirects: rules.length > 0 || (cmsResult.data?.length ?? 0) > 0,
      llmsAndCapsule: (llmsResult.data?.length ?? 0) > 0 && gaps.size > 0,
      recovery: (eventResult.data?.length ?? 0) > 0 || (webhookResult.data?.length ?? 0) > 0,
    };
  } catch {}

  return (
    <main className="min-h-screen bg-[#07090E] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
      <Sidebar items={[{ label: "Overview", href: "/dashboard#overview", active: true }, { label: "Citation Monitoring", href: "/dashboard#audit-history" }, { label: "Broken Citation 404s", href: "/dashboard#recovery-command" }, { label: "Competitor Hijack", href: "/dashboard#recovery-command" }, { label: "Listicles & Reddit", href: "/dashboard#recovery-command" }, { label: "404 Interceptor Pixel", href: "/dashboard/pixel" }, { label: "Capsules & llms.txt", href: "/dashboard#llms-txt-generator" }, { label: "Entity Truth & Schema", href: "/dashboard#recovery-command" }, { label: "Redirect Sync", href: "/dashboard#redirect-export" }, { label: "Reports & White-Label", href: "/dashboard#audit-history" }, { label: "Settings & Billing", href: "/dashboard#settings" }]} />
      <div className="min-w-0 flex-1 px-5 py-8 sm:px-8 sm:py-10">
      <div id="overview"><PageHeader eyebrow={`Live telemetry · ${audits.length} saved scans`} title="Command Center" description="Monitor citations, recover links, and pursue hijack opportunities." actions={<><Link href="/" className="rounded-full px-3 py-2 text-xs font-medium text-slate-400 hover:text-white">Public site</Link><DomainSwitcher domains={allDomains} selected={selectedDomain} /><RedirectSyncButton domains={[...new Set(audits.map(audit => audit.domain))]} /><RedirectExportDrawer rules={exportRules} /><Link href="/dashboard/pixel" className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-white/5">Pixel &amp; traffic</Link><Link href="/#audit" className="rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-[#07110d]">Run live audit</Link><CheckoutButton /><UserButton /></>} /></div>
      <OnboardingChecklist progress={onboarding} />
      <MetricCards audits={audits} rescued={rescued} />
      {latestReport && <section aria-label="Quick tools" className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4"><h2 className="text-sm font-semibold text-white">Quick Tools</h2><a href={`/audit/${latestReport.id}?print=1`} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-300">Export Report / Save as PDF</a><p className="mt-2 text-xs text-slate-500">Opens the latest report for {latestReport.domain}.</p></section>}
      <OpportunityCommandCenter opportunities={opportunities} brokenLinks={audits.flatMap(audit => audit.broken_links.map(link => ({ ...link, auditId: audit.id, domain: audit.domain }))) } syncedLinks={syncedLinks} />
      <WeeklyMonitoring isPro={isPro} />
      <div id="llms-txt-generator"><LlmsTxtGenerator domains={[...new Set(audits.map((audit) => audit.domain))]} /></div>
      <p id="redirect-export" className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-slate-400">Pro users can publish or disable verified 301 suggestions below. Rules become active when the Cloudflare Worker is attached to the domain; edge lookups can retain a change for up to five seconds.</p>
      <WorkspaceIntegrations key={`workspace-${selectedDomain}`} domains={[...new Set(audits.map(audit => audit.domain))]} />
      <AgencyProfileSettings key={`agency-${selectedDomain}`} domains={[...new Set(audits.map(audit => audit.domain))]} isPro={isPro} />
      {audits.length ? <div id="audit-history" className="space-y-4">{audits.map((audit) => <AuditCard key={audit.id} audit={audit} gap={gaps.get(audit.id)} isPro={isPro} activeRules={activeRules} syncedLinks={syncedLinks} />)}</div> : <EmptyState title="No audits saved yet" description="Run an audit and it will appear here." action={<Link href="/#audit" className="inline-flex rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-[#07110d]">Run an audit</Link>} />}
      </div></div>
    </main>
  );
}

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ domain?: string | string[] }> }) {
  return <Suspense fallback={<HistoryLoading />}><UserAuditHistory searchParams={searchParams} /></Suspense>;
}
