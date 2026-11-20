import Link from "next/link";
import { getDashboardPageData } from "@/lib/dashboard-page-data";
import ScheduledReportSettings from "@/components/ScheduledReportSettings";
import PrintReportButton from "@/components/print-report-button";
import { PageHeader } from "@/components/ui/page-header";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const params = await searchParams;
  const data = await getDashboardPageData(params.domain);
  const completed = data.audits.filter(audit => audit.domain === data.domain && ["completed", "partial"].includes(audit.status));
  const ids = completed.map(audit => audit.id);
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  let metrics = { errors: 0, visits: 0, prevented: 0, hours: 0 };
  if (ids.length) {
    const [errors, visits, prevented, handled] = await Promise.all([
      data.db.from("recovery_findings").select("id", { count: "exact", head: true }).in("audit_id", ids).eq("domain", data.domain).gte("created_at", start).lt("created_at", end).eq("finding_type", "dead_url").in("approval_status", ["pending_human_review", "approved"]),
      data.db.from("rescued_ai_visits").select("id", { count: "exact", head: true }).in("user_id", data.ownerUserIds).eq("domain", data.domain).gte("created_at", start).lt("created_at", end),
      data.db.from("recovery_findings").select("id", { count: "exact", head: true }).in("audit_id", ids).eq("domain", data.domain).gte("created_at", start).lt("created_at", end).or("guardrail_classification.eq.leave_as_404_or_410,approval_status.eq.rejected_bad_recommendation"),
      data.db.from("recovery_findings").select("id", { count: "exact", head: true }).in("audit_id", ids).eq("domain", data.domain).gte("created_at", start).lt("created_at", end).neq("approval_status", "pending_human_review"),
    ]);
    metrics = { errors: errors.count ?? 0, visits: visits.count ?? 0, prevented: prevented.count ?? 0, hours: Math.round((handled.count ?? 0) * 0.25 * 100) / 100 };
  }
  const cards = [
    ["High-intent errors caught", metrics.errors.toLocaleString(), "Measured dead URL findings still pending review or approved."],
    ["Recovered visits", metrics.visits.toLocaleString(), "Owner-tagged rescue visits; orders are measured separately."],
    ["Unsafe recommendations prevented", metrics.prevented.toLocaleString(), "Findings left as 404/410 or explicitly rejected."],
    ["Engineering hours saved", `~${metrics.hours.toLocaleString()}h`, "Estimate: 0.25 hours per finding handled."],
  ];
  return <div className="space-y-4">
    <PageHeader eyebrow="Prove / reporting" title="Executive & White-Label Reports" description="Monthly retention outcomes, provenance breakdown, and print-ready evidence reports." actions={<PrintReportButton/>}/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Monthly ROI preview">{cards.map(([label, value, note], index) => <article key={label} className="rounded-xl border border-border bg-surface-raised p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"><p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">{label}</p><p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</p><p className="mt-2 text-[10px] leading-4 text-text-secondary">{note}</p>{index === 3 && <span className="mt-2 inline-flex rounded-full border border-warning/25 px-2 py-0.5 font-mono text-[9px] text-warning">ESTIMATE</span>}</article>)}</div>
    <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-text-secondary">Scheduled delivery stays behind <code>OUTBOUND_EMAILS_ENABLED</code>; creating or printing a report does not bypass the outbound email lock.</div>
    <ScheduledReportSettings domain={data.domain}/>
    <section className="overflow-hidden rounded-xl border border-border bg-surface-raised"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Saved audit reports</h2><p className="mt-1 text-xs text-text-secondary">Shareable evidence reports are available for each completed audit.</p></div>{completed.length ? <ul className="divide-y divide-border">{completed.map(audit => <li key={audit.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><p className="break-all font-mono text-sm">{audit.domain}</p><p className="mt-1 text-xs text-text-tertiary">{new Date(audit.created_at).toLocaleDateString()} · {audit.status}</p></div><div className="flex flex-wrap gap-3 text-xs"><Link href={`/audit/${audit.id}`} className="text-accent-strong hover:underline">Open report</Link><Link href={`/audit/${audit.id}?print=1`} target="_blank" className="text-accent-strong hover:underline">Print / PDF</Link><Link href={`/dashboard/reports/monthly?domain=${encodeURIComponent(audit.domain)}`} className="text-accent-strong hover:underline">Monthly ROI</Link></div></li>)}</ul> : <p className="px-5 py-6 text-sm text-text-secondary">Run an audit to create your first report.</p>}</section>
  </div>;
}
