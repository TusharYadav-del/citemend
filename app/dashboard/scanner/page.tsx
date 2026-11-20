import { getDashboardPageData } from "@/lib/dashboard-page-data";
import { DashboardScannerForm } from "@/components/dashboard-scanner-form";
import AuditTemplates from "@/components/AuditTemplates";
import { PageHeader } from "@/components/ui/page-header";

export default async function ScannerPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const params = await searchParams; const data = await getDashboardPageData(params.domain);
  return <div><PageHeader eyebrow="Core · audit runner" title="Live AI & URL Scanner" description="Run a search-grounded buyer-question audit. Review sources and URL findings before any recovery action."/><div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)] xl:items-start"><div><DashboardScannerForm key={data.domain}/></div><aside className="rounded-xl border border-border bg-surface-raised p-5"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-text-tertiary">Live job tracking</p><h2 className="mt-2 text-base font-semibold">See each scan step</h2><p className="mt-2 text-sm leading-6 text-text-secondary">Queued jobs publish saved progress to the job pill in the top bar. On completion, the report appears in Reports and Recent audits.</p><div className="mt-4 space-y-2" aria-hidden="true"><div className="h-2 w-2/5 animate-pulse rounded bg-surface-soft"/><div className="h-2 w-4/5 animate-pulse rounded bg-surface-soft"/><div className="h-2 w-3/5 animate-pulse rounded bg-surface-soft"/></div></aside></div><div className="mt-6"><AuditTemplates/></div></div>;
}
