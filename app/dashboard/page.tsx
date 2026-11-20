import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { getUserAuditHistory } from "@/lib/audit-history";
import { PageHeader } from "@/components/ui/page-header";

export default async function DashboardOverview({ searchParams }: { searchParams: Promise<{ domain?: string | string[] }> }) {
  const session = await auth();
  if (!session.userId) redirect("/sign-in?redirect_url=%2Fdashboard");
  const db = createServerDatabase();
  const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
  const audits = await getUserAuditHistory(session.userId, access.ownerUserIds);
  const params = await searchParams;
  const requested = Array.isArray(params.domain) ? params.domain[0] : params.domain;
  const domains = [...new Set(audits.map(audit => audit.domain))];
  const domain = requested && domains.includes(requested) ? requested : domains[0] ?? "";
  const scoped = domain ? audits.filter(audit => audit.domain === domain) : audits;
  const auditIds = scoped.map(audit => audit.id);
  let deployed: number | null = null;
  let citations: number | null = null;
  let rescuedVisits: number | null = null;
  let hoursSaved: number | null = null;
  try {
    if (!auditIds.length) { deployed = 0; citations = 0; rescuedVisits = 0; hoursSaved = 0; }
    else {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [outcomes, findings, visits] = await Promise.all([
        db.from("recovery_outcomes").select("technical_deployment_verified_at,ai_citation_observed_at").in("audit_id", auditIds).limit(5000),
        db.from("recovery_findings").select("approval_status").in("audit_id", auditIds).limit(5000),
        db.from("rescued_ai_visits").select("id", { count: "exact", head: true }).in("domain", domain ? [domain] : domains).in("user_id", access.ownerUserIds).gte("created_at", since),
      ]);
      if (!outcomes.error) { deployed = (outcomes.data ?? []).filter(row => row.technical_deployment_verified_at).length; citations = (outcomes.data ?? []).filter(row => row.ai_citation_observed_at).length; }
      if (!findings.error) hoursSaved = Math.round((findings.data ?? []).filter(row => ["approved", "deployed", "verified", "resolved"].includes(row.approval_status)).length * 0.25 * 100) / 100;
      if (!visits.error) rescuedVisits = visits.count ?? 0;
    }
  } catch {}
  const metrics = [
    { label: "Verified redirect deployments", value: deployed === null ? "Not measured" : deployed.toLocaleString(), note: "Technical redirect verification recorded for this workspace" },
    { label: "AI citations re-observed", value: citations === null ? "Not measured" : citations.toLocaleString(), note: "A later observation recorded the canonical page" },
    { label: "Recovered AI visits · 30 days", value: rescuedVisits === null ? "Not measured" : rescuedVisits.toLocaleString(), note: "Owner-tagged redirect telemetry; separate from orders" },
    { label: "Operations hours saved", value: hoursSaved === null ? "Not measured" : `~${hoursSaved.toLocaleString()}h`, note: "Estimate based on 0.25 hours per handled finding", tag: "ESTIMATE" },
  ];
  const recent = scoped.filter(audit => ["completed", "partial"].includes(audit.status)).slice(0, 5);
  return <div className="space-y-6">
    <PageHeader eyebrow="Executive command overview" title="Your evidence ledger" description="Recent audits and verified outcomes for the selected workspace." />
    <section aria-label="Four-metric retention scorecard" className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <article key={metric.label} className="flex h-full min-h-40 flex-col rounded-xl border border-border bg-surface-raised p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"><div className="flex items-start justify-between gap-2"><p className="text-xs font-medium text-text-secondary">{metric.label}</p>{"tag" in metric && metric.tag && <span className="rounded-full border border-warning/25 bg-warning/5 px-2 py-0.5 font-mono text-[9px] text-warning">{metric.tag}</span>}</div><p className="mt-5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">{metric.value}</p><p className="mt-auto pt-4 text-[11px] leading-5 text-text-tertiary">{metric.note}</p></article>)}</section>
    {scoped.length === 0 && <details open className="group rounded-xl border border-border bg-surface-raised shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 marker:content-none"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-accent-strong">Guided setup · 4 steps</p><h3 className="mt-1 text-base font-semibold">Connect your first evidence source</h3></div><span className="grid size-8 place-items-center rounded-lg border border-border text-text-secondary transition-transform group-open:rotate-90">›</span></summary><div className="border-t border-border px-5 pb-5 pt-4"><ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{["Choose a public domain", "Add buyer questions", "Run a live AI and URL scan", "Review evidence before changes"].map((step,index)=><li key={step} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-xs leading-5 text-text-secondary"><span className="grid size-7 shrink-0 place-items-center rounded-full border border-border font-mono text-[10px] text-accent-strong">0{index+1}</span>{step}</li>)}</ol><Link href="/dashboard/scanner" className="cm-button-primary mt-4">Start first audit</Link></div></details>}
    <section className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"><div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-text-tertiary">Verified activity</p><h3 className="mt-1 text-base font-semibold">Recent audits</h3></div><Link href="/dashboard/reports" className="text-xs font-medium text-accent-strong hover:underline">All reports →</Link></div>{recent.length ? <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{recent.map(audit => <li key={audit.id} className="flex min-h-28 flex-col justify-between rounded-lg border border-border bg-background p-4"><div><p className="font-mono text-sm text-foreground">{audit.domain}</p><p className="mt-1 text-[11px] text-text-tertiary">{new Date(audit.created_at).toLocaleString()} · {audit.status}</p></div><Link href={`/audit/${audit.id}`} className="mt-4 inline-flex w-fit text-xs font-medium text-accent-strong hover:underline">Open evidence →</Link></li>)}</ul> : <p className="px-5 py-6 text-sm text-text-secondary">No saved audits yet. Start one from the scanner to populate verified activity.</p>}</section>
  </div>;
}
