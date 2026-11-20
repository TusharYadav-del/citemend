import { getDashboardPageData } from "@/lib/dashboard-page-data";
import { ExtractabilityAuditPanel } from "@/components/ExtractabilityAuditPanel";
import LlmsTxtGenerator from "@/components/LlmsTxtGenerator";
import AuditAnalysisTools from "@/components/AuditAnalysisTools";
import { PageHeader } from "@/components/ui/page-header";

export default async function GeoPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const params = await searchParams;
  const data = await getDashboardPageData(params.domain);
  const latest = data.audits.find(audit => audit.domain === data.domain && ["completed", "partial"].includes(audit.status));
  return <div className="space-y-4">
    <PageHeader eyebrow="Defend / extractability" title="GEO & Claims" description="Measure crawler access, rendered content, navigation size, answer capsules, quote and statistic density, and freshness on discovered pages." />
    <ExtractabilityAuditPanel auditId={latest?.id} />
    <section className="rounded-xl border border-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-accent">Impact × effort</p><h2 className="mt-1 font-semibold">Prioritized checks</h2></div><span className="rounded-full border border-border bg-background px-3 py-1 text-[10px] text-text-secondary">Tier 1 / Tier 2 evidence</span></div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2"><li className="rounded-lg border border-border bg-background p-3"><strong className="text-xs text-foreground">Tier 1 · Access and clarity</strong><p className="mt-1 text-xs leading-5 text-text-secondary">Crawler permissions, reachable llms.txt, early answer capsule, and concise navigation.</p></li><li className="rounded-lg border border-border bg-background p-3"><strong className="text-xs text-foreground">Tier 2 · Evidence quality</strong><p className="mt-1 text-xs leading-5 text-text-secondary">Freshness, quote and statistic density, and F1–F6 claim review signals.</p></li></ul>
    </section>
    <section className="rounded-xl border border-border bg-surface-raised p-5"><h2 className="font-semibold">Crawler and content checks</h2><ul className="mt-3 grid gap-2 text-xs leading-5 text-text-secondary sm:grid-cols-2"><li>robots.txt permission matrix for GPTBot, PerplexityBot, ClaudeBot and Google-Extended</li><li>/llms.txt availability is reported independently</li><li>Navigation health flags pages with 60 or more links</li><li>First 30% answer capsule and over 90-day freshness signals</li><li>F1–F6 claim and stale-fact review appears in saved audit evidence</li></ul></section>
    <LlmsTxtGenerator domains={data.domains} />
    {latest && <AuditAnalysisTools auditId={latest.id} />}
  </div>;
}
