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

function HistoryLoading() {
  return <main className="min-h-screen bg-[#07090E] px-5 py-10 text-white sm:px-8 sm:py-14" role="status" aria-label="Loading your command center"><div className="h-8 w-52 animate-pulse rounded-lg bg-white/10" /><div className="mt-8 grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div><span className="sr-only">Loading your audit history...</span></main>;
}

function MetricCards({ audits, opportunities }: { audits: UserAuditHistoryItem[]; opportunities: { opportunity_type: string }[] }) {
  const metrics = historyMetrics(audits);
  const health = audits.length ? Math.max(0, 100 - metrics.active404s) : null;
  const cards = [
    { label: "AI Citation Health Score", value: health === null ? "—" : `${health}%`, detail: "100 minus unresolved saved 404s; citations are not stored" },
    { label: "Own-Domain 404s Caught", value: metrics.active404s, detail: "Confirmed in latest audit per domain" },
    { label: "Competitor 404s to Hijack", value: opportunities.filter(item => item.opportunity_type === "competitor_direct_404" || item.opportunity_type === "listicle_outbound_404").length, detail: "Dead competitor citations saved" },
    { label: "Cited Listicles & Reddit Gaps", value: opportunities.filter(item => item.opportunity_type === "listicle_missing_brand" || item.opportunity_type === "reddit_citation_thread").length, detail: "Third-party citations to review" },
  ];
  return <section aria-label="Live telemetry" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <div key={card.label} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-sm sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-emerald-400">{card.label}</p><p className="mt-3 text-3xl font-semibold tabular-nums text-white">{typeof card.value === "number" ? card.value.toLocaleString() : card.value}</p><p className="mt-2 text-xs leading-5 text-slate-400">{card.detail}</p></div>)}</section>;
}

function HistoryUnavailable() {
  return <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-100"><h2 className="font-semibold">Audit history is not ready</h2><p className="mt-2 text-sm leading-6">Apply `supabase/migrations/002_audit_user_ownership.sql` in the Supabase SQL Editor, then reload this page.</p></div>;
}

function ruleKey(value: string): string | null {
  try { const url = new URL(value); return `${url.hostname.toLowerCase()}:${url.pathname}`; }
  catch { return null; }
}

function AuditCard({ audit, isPro, activeRules, gap }: { gap?: CitationGap; audit: UserAuditHistoryItem; isPro: boolean | null; activeRules: Set<string> }) {
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
                {link.http_status === 404 && link.suggested_redirect && ruleKey(link.cited_url) && <PublishRedirect linkId={link.id} initiallyActive={activeRules.has(ruleKey(link.cited_url)!)} isPro={isPro} />}
              </li>
            ))}
          </ul>
        </details>
      )}
      {gap && <div id="citation-gaps"><CitationGapPanel domain={audit.domain} gap={gap} /></div>}
    </article>
  );
}

async function UserAuditHistory() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  let isPro: boolean | null = null;
  try { isPro = await hasProSubscription(userId); } catch {}

  let audits: UserAuditHistoryItem[];
  try { audits = await getUserAuditHistory(userId); }
  catch { return <HistoryUnavailable />; }

  let gaps = new Map<string, CitationGap>();
  try { gaps = await getAuditCitationGaps(userId); } catch {}

  let activeRules = new Set<string>();
  let exportRules: { source_path: string; target_url: string }[] = [];
  let opportunities: { id: string; audit_id: string | null; domain: string; opportunity_type: string; prompt_query: string; target_url: string; dead_competitor_url: string | null; competitor_domain: string | null; http_status: number | null; matched_user_live_url: string | null; similarity_score: number | null; contact_email_or_link: string | null; outreach_draft: string | null; corrective_schema_json: string | null; verification_status: string }[] = [];
  let onboarding: OnboardingProgress = { firstAudit: audits.some((audit) => ["completed", "partial"].includes(audit.status)), redirects: false, llmsAndCapsule: false, recovery: false };
  try {
    const db = createServerDatabase();
    const domains = [...new Set(audits.map((audit) => audit.domain))];
    const auditIds = audits.map(audit => audit.id);
    const [rulesResult, cmsResult, llmsResult, webhookResult, eventResult, opportunityResult] = await Promise.all([
      db.from("redirect_rules").select("source_host,source_path,target_url,synced_to_cms").eq("user_id", userId).eq("active", true).eq("is_active", true).limit(500),
      db.from("cms_connections").select("id").eq("user_id", userId).eq("platform", "shopify").limit(1),
      db.from("audits").select("id").eq("user_id", userId).not("llms_txt_content", "is", null).limit(1),
      db.from("audits").select("id").eq("user_id", userId).not("webhook_url", "is", null).limit(1),
      domains.length ? db.from("ai_404_events").select("id").in("domain", domains).limit(1) : Promise.resolve({ data: [], error: null }),
      auditIds.length ? db.from("citation_hijack_opportunities").select("id,audit_id,domain,opportunity_type,prompt_query,target_url,dead_competitor_url,competitor_domain,http_status,matched_user_live_url,similarity_score,contact_email_or_link,outreach_draft,corrective_schema_json,verification_status").in("audit_id", auditIds).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(500) : Promise.resolve({ data: [], error: null }),
    ]);
    if (rulesResult.error || cmsResult.error || llmsResult.error || webhookResult.error || eventResult.error || opportunityResult.error) throw rulesResult.error ?? cmsResult.error ?? llmsResult.error ?? webhookResult.error ?? eventResult.error ?? opportunityResult.error;
    const rules = rulesResult.data ?? [];
    activeRules = new Set(rules.map((rule) => `${rule.source_host}:${rule.source_path}`));
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
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-black/20 px-5 py-8 lg:block"><Link href="/dashboard" className="text-sm font-bold tracking-wide text-white">CITEMEND <span className="text-emerald-400">/ COMMAND</span></Link><nav aria-label="Main navigation" className="mt-10 space-y-1 text-sm"><a href="#audit-history" className="block rounded-lg bg-emerald-400/10 px-3 py-2.5 font-semibold text-emerald-300">Dashboard</a><Link href="/dashboard/pixel" className="block rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">404 Interceptor</Link><a href="#recovery-command" className="block rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">Citation Hijacker</a><a href="#citation-gaps" className="block rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">Citation Capsule</a><a href="#llms-txt-generator" className="block rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">llms.txt &amp; Facts</a><a href="#settings" className="block rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">Settings</a></nav><div className="mt-12 rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-xs text-slate-400"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />Systems operational</div></aside>
      <div className="min-w-0 flex-1 px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div><Link href="/" className="text-sm font-medium text-emerald-300 hover:underline">&larr; Back to Citemend</Link><p className="mt-4 text-[10px] font-semibold tracking-[.18em] text-emerald-400">LIVE TELEMETRY · {audits.length} SAVED SCANS</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Command Center</h1><p className="mt-2 text-sm text-slate-400">Monitor citations, recover links, and pursue hijack opportunities.</p></div>
        <div className="flex items-center gap-3"><RedirectExportDrawer rules={exportRules} /><Link href="/dashboard/pixel" className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-white/5">Pixel &amp; traffic</Link><CheckoutButton /><UserButton /></div>
      </header>
      <OnboardingChecklist progress={onboarding} />
      <MetricCards audits={audits} opportunities={opportunities} />
      <OpportunityCommandCenter opportunities={opportunities} brokenLinks={audits.flatMap(audit => audit.broken_links.map(link => ({ ...link, auditId: audit.id, domain: audit.domain }))) } />
      <WeeklyMonitoring isPro={isPro} />
      <div id="llms-txt-generator"><LlmsTxtGenerator domains={[...new Set(audits.map((audit) => audit.domain))]} /></div>
      <p id="redirect-export" className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-slate-400">Pro users can publish or disable verified 301 suggestions below. Rules become active when the Cloudflare Worker is attached to the domain; edge lookups can retain a change for up to five seconds.</p>
      <p id="settings" className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-slate-400">Audits created before account ownership was enabled have no associated user and are not assigned to an account automatically.</p>
      {audits.length ? <div id="audit-history" className="space-y-4">{audits.map((audit) => <AuditCard key={audit.id} audit={audit} gap={gaps.get(audit.id)} isPro={isPro} activeRules={activeRules} />)}</div> : <section className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center"><h2 className="text-base font-semibold text-white">No audits saved yet</h2><p className="mt-2 text-sm text-slate-400">Run an audit and it will appear here.</p><Link href="/#audit" className="mt-5 inline-flex rounded-lg bg-emerald-400 px-5 py-3 text-sm font-medium text-[#07110d]">Run an audit</Link></section>}
      </div></div>
    </main>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<HistoryLoading />}><UserAuditHistory /></Suspense>;
}
