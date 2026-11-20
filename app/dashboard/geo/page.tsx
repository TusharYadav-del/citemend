import { getDashboardPageData } from "@/lib/dashboard-page-data";
import { ExtractabilityAuditPanel } from "@/components/ExtractabilityAuditPanel";
import LlmsTxtGenerator from "@/components/LlmsTxtGenerator";
import AuditAnalysisTools from "@/components/AuditAnalysisTools";

export default async function GeoPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const params = await searchParams; const data = await getDashboardPageData(params.domain);
  const latest = data.audits.find(audit => audit.domain === data.domain && ["completed", "partial"].includes(audit.status));
  return <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Optimize / extractability</p><h2 className="mt-1 text-2xl font-semibold">GEO Extractability Auditor</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">Measure crawler access, rendered content, navigation size, answer capsules, quotation and statistic density, and freshness on pages discovered from your site.</p><div className="mt-5"><ExtractabilityAuditPanel auditId={latest?.id} /></div><section className="mt-4 rounded-xl border border-border bg-surface p-5"><h3 className="font-semibold">Content and crawler checks</h3><ul className="mt-3 grid gap-2 text-sm text-text-secondary sm:grid-cols-2"><li>robots.txt access for GPTBot, PerplexityBot, ClaudeBot and Google-Extended</li><li>/llms.txt availability reported independently</li><li>Navigation link count flags pages at 60 or more links</li><li>First 30% answer capsule and over 90-day freshness signals</li><li>F1–F6 claim and stale-fact review signals appear in saved audit evidence</li></ul></section><div className="mt-4"><LlmsTxtGenerator domains={data.domains} /></div>{latest && <div className="mt-4"><AuditAnalysisTools auditId={latest.id} /></div>}</div>;
}
