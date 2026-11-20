import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { getUserAuditHistory } from "@/lib/audit-history";

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
    { label: "Operations hours saved", value: hoursSaved === null ? "Not measured" : `~${hoursSaved.toLocaleString()}h`, note: "Estimate based on 0.25 hours per handled finding" },
  ];
  const recent = scoped.filter(audit => ["completed", "partial"].includes(audit.status)).slice(0, 5);
  return <div className="space-y-6">
    <section className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Executive command overview</p><h2 className="mt-1 text-2xl font-semibold">Your evidence ledger</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">A focused view of recent audits and verified workspace outcomes.</p></div><Link href="/dashboard/scanner" className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-background">Run an audit</Link></section>
    <section aria-label="Four-metric retention scorecard" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <article key={metric.label} className="rounded-xl border border-border bg-surface p-5"><p className="text-xs text-text-secondary">{metric.label}</p><p className="mt-3 font-mono text-3xl font-semibold tabular-nums">{metric.value}</p><p className="mt-2 text-[11px] leading-5 text-text-tertiary">{metric.note}</p></article>)}</section>
    {scoped.length === 0 && <section className="rounded-xl border border-accent/20 bg-surface p-5"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-accent">Guided first audit · 4 steps</p><h3 className="mt-2 text-lg font-semibold">Connect your first evidence source</h3><ol className="mt-4 grid gap-3 sm:grid-cols-2">{["Choose a public domain", "Add two buyer questions", "Run a live AI and URL scan", "Review evidence before approving fixes"].map((step, index) => <li key={step} className="flex gap-3 rounded-lg border border-border bg-surface-raised p-3 text-sm"><span className="font-mono text-accent">0{index + 1}</span>{step}</li>)}</ol><Link href="/dashboard/scanner" className="mt-4 inline-flex text-sm font-semibold text-accent">Start scanner →</Link></section>}
    <section className="overflow-hidden rounded-xl border border-border bg-surface"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-accent">Verified activity</p><h3 className="mt-1 text-base font-semibold">Recent audits</h3></div><Link href="/dashboard/reports" className="text-xs text-accent">View reports →</Link></div>{recent.length ? <ul className="divide-y divide-border">{recent.map(audit => <li key={audit.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-mono text-sm">{audit.domain}</p><p className="mt-1 text-xs text-text-tertiary">{new Date(audit.created_at).toLocaleString()} · {audit.status}</p></div><Link href={`/audit/${audit.id}`} className="text-xs font-medium text-accent">Open evidence →</Link></li>)}</ul> : <p className="px-5 py-6 text-sm text-text-secondary">No saved audits yet. Start one from the scanner to populate verified activity.</p>}</section>
  </div>;
}
