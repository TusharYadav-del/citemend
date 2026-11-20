import { getDashboardPageData } from "@/lib/dashboard-page-data";
import { DashboardScannerForm } from "@/components/dashboard-scanner-form";

export default async function ScannerPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const params = await searchParams; const data = await getDashboardPageData(params.domain);
  return <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Scanner / prompt audit runner</p><h2 className="mt-1 text-2xl font-semibold">Live AI &amp; URL Scanner</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">Run a search-grounded buyer-question audit. Results are saved to your workspace and can be reviewed before any recovery action.</p><DashboardScannerForm key={data.domain} />
    <section className="mt-5 rounded-xl border border-border bg-surface p-5"><h3 className="font-semibold">Live audit progress</h3><p className="mt-2 text-sm text-text-secondary">Queued jobs publish progress to the command bar. New completed scans appear in Reports and the activity feed.</p></section>
  </div>;
}
