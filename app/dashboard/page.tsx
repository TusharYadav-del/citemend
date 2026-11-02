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

function HistoryLoading() {
  return <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14" role="status" aria-label="Loading your audit history"><div className="h-8 w-52 animate-pulse rounded-lg bg-[#e9eee4]" /><div className="mt-8 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-[#f1f4ed]" />)}</div><div className="mt-8 h-36 animate-pulse rounded-2xl bg-[#f1f4ed]" /><span className="sr-only">Loading your audit history...</span></main>;
}

function MetricCards({ audits }: { audits: UserAuditHistoryItem[] }) {
  const metrics = historyMetrics(audits);
  const cards = [
    { label: "Total scans", value: metrics.totalScans, detail: "Saved audits in your account" },
    { label: "Active 404s", value: metrics.active404s, detail: "In each domain's latest scan" },
    { label: "Redirects ready", value: metrics.redirectsReady, detail: "Suggested fixes, not deployed" },
  ];
  return <section aria-label="Audit summary" className="mb-6 grid gap-4 sm:grid-cols-3">{cards.map((card) => <div key={card.label} className="min-w-0 rounded-2xl border border-[#dfe5dc] bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#557447]">{card.label}</p><p className="mt-3 text-3xl font-semibold tabular-nums text-[#182c25]">{card.value.toLocaleString()}</p><p className="mt-2 text-xs leading-5 text-[#68736b]">{card.detail}</p></div>)}</section>;
}

function HistoryUnavailable() {
  return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><h2 className="font-semibold">Audit history is not ready</h2><p className="mt-2 text-sm leading-6">Apply `supabase/migrations/002_audit_user_ownership.sql` in the Supabase SQL Editor, then reload this page.</p></div>;
}

function ruleKey(value: string): string | null {
  try { const url = new URL(value); return `${url.hostname.toLowerCase()}:${url.pathname}`; }
  catch { return null; }
}

function AuditCard({ audit, isPro, activeRules, gap }: { gap?: CitationGap; audit: UserAuditHistoryItem; isPro: boolean | null; activeRules: Set<string> }) {
  const brokenLinks = audit.broken_links ?? [];
  return (
    <article className="rounded-2xl border border-[#dfe5dc] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="break-all text-lg font-semibold">{audit.domain}</h2>
          <p className="mt-1 text-xs text-[#7a837b]">{new Date(audit.created_at).toLocaleString()}</p>
        </div>
        <span className="rounded-full border border-[#dae2d4] bg-[#f5f8f0] px-3 py-1 text-xs font-medium text-[#557447]">{audit.status}</span>
      </div>
      <p className="mt-4 text-xs text-[#68736b]">Anyone with the report link can view its findings.</p><Link href={`/audit/${audit.id}`} className="mt-2 inline-block text-sm font-medium text-[#53704e] hover:underline">Open shareable report &rarr;</Link><p className="mt-5 text-sm text-[#68736b]">{brokenLinks.length} confirmed broken link{brokenLinks.length === 1 ? "" : "s"}</p>
      {brokenLinks.length > 0 && (
        <details className="mt-4 border-t border-[#edf0e9] pt-4">
          <summary className="cursor-pointer text-sm font-medium">View broken links and redirect suggestions</summary>
          <ul className="mt-3 space-y-3">
            {brokenLinks.map((link) => (
              <li key={link.id} className="rounded-lg bg-[#f7f8f4] p-3 text-xs">
                <p className="break-all font-medium">{link.cited_url} <span className="text-red-700">HTTP {link.http_status}</span></p>
                {link.suggested_redirect && <p className="mt-2 break-all text-[#456936]">Suggested destination: {link.suggested_redirect}</p>}
                {link.http_status === 404 && link.suggested_redirect && ruleKey(link.cited_url) && <PublishRedirect linkId={link.id} initiallyActive={activeRules.has(ruleKey(link.cited_url)!)} isPro={isPro} />}
              </li>
            ))}
          </ul>
        </details>
      )}
      {gap && <CitationGapPanel domain={audit.domain} gap={gap} />}
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
  try {
    const { data, error } = await createServerDatabase().from("redirect_rules").select("source_host,source_path,target_url").eq("user_id", userId).eq("active", true).eq("is_active", true).limit(500);
    if (!error) {
      activeRules = new Set((data ?? []).map((rule) => `${rule.source_host}:${rule.source_path}`));
      exportRules = (data ?? []).map((rule) => ({ source_path: rule.source_path, target_url: rule.target_url }));
    }
  } catch {}

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#dfe5dc] pb-6">
        <div><Link href="/" className="text-sm font-medium text-[#53704e] hover:underline">&larr; Back to Citemend</Link><p className="mt-4 text-[10px] font-semibold tracking-[.18em] text-[#53704e]">YOUR WORKSPACE</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Audit history</h1><p className="mt-2 text-sm text-[#68736b]">Your saved audits, sorted from newest to oldest.</p></div>
        <div className="flex items-center gap-3"><RedirectExportDrawer rules={exportRules} /><Link href="/dashboard/pixel" className="rounded-lg border border-[#dfe5dc] px-3 py-2 text-sm font-medium text-[#36583f] hover:bg-[#f7f8f4]">Pixel &amp; traffic</Link><CheckoutButton /><UserButton /></div>
      </header>
      <MetricCards audits={audits} />
      <WeeklyMonitoring isPro={isPro} />
      <p className="mb-6 rounded-xl border border-[#dfe5dc] bg-[#f7f8f4] p-4 text-xs leading-5 text-[#68736b]">Pro users can publish or disable verified 301 suggestions below. Rules become active when the Cloudflare Worker is attached to the domain; edge lookups can retain a change for up to five seconds.</p>
      <p className="mb-6 rounded-xl border border-[#dfe5dc] bg-[#f7f8f4] p-4 text-xs leading-5 text-[#68736b]">Audits created before account ownership was enabled have no associated user and are not assigned to an account automatically.</p>
      {audits.length ? <div className="space-y-4">{audits.map((audit) => <AuditCard key={audit.id} audit={audit} gap={gaps.get(audit.id)} isPro={isPro} activeRules={activeRules} />)}</div> : <section className="rounded-2xl border border-dashed border-[#d6dfce] px-6 py-14 text-center"><h2 className="text-base font-semibold">No audits saved yet</h2><p className="mt-2 text-sm text-[#85907e]">Run an audit and it will appear here.</p><Link href="/#audit" className="mt-5 inline-flex rounded-lg bg-[#214d39] px-5 py-3 text-sm font-medium text-white">Run an audit</Link></section>}
    </main>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<HistoryLoading />}><UserAuditHistory /></Suspense>;
}
