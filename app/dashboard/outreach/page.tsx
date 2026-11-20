import { getDashboardPageData } from "@/lib/dashboard-page-data";
import OpportunityCommandCenter, { type Opportunity } from "@/components/OpportunityCommandCenter";
import { PageHeader } from "@/components/ui/page-header";

function maskEmail(email: string) {
  const [name, host] = email.split("@");
  return host ? `${name.slice(0, 1)}•••@${host}` : "••••••";
}

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const params = await searchParams;
  const data = await getDashboardPageData(params.domain);
  const enabled = process.env.OUTBOUND_EMAILS_ENABLED === "true";
  const audits = data.domain ? data.audits.filter(audit => audit.domain === data.domain) : data.audits;
  const ids = audits.map(audit => audit.id);
  let opportunities: Opportunity[] = [];
  if (ids.length) { const result = await data.db.from("citation_hijack_opportunities").select("*").in("audit_id", ids).order("composite_priority_score", { ascending: false }).limit(100); if (!result.error) opportunities = (result.data ?? []) as unknown as Opportunity[]; }
  const brokenLinks = audits.flatMap(audit => audit.broken_links.map(link => ({ ...link, auditId: audit.id, domain: audit.domain })));
  const suppressions = data.domain ? await data.db.from("outreach_suppressions").select("email,reason,source,created_at").eq("domain", data.domain).order("created_at", { ascending: false }).limit(30) : null;
  const maskedSuppressions = suppressions && !suppressions.error ? (suppressions.data ?? []).map(item => ({ ...item, email: maskEmail(item.email) })) : [];
  return <div className="space-y-4">
    <PageHeader eyebrow="Win / verified outreach" title="Outreach Workbench" description="Draft-first outreach built around a verified broken citation and a reviewed replacement page." />
    <div role="status" className={`rounded-lg border p-4 text-sm ${enabled ? "border-success/20 bg-success/5 text-success" : "border-warning/20 bg-warning/5 text-warning"}`}><strong>Outbound lock: {enabled ? "enabled" : "locked"}</strong><p className="mt-1 text-xs leading-5">{enabled ? "Sending is available only for explicitly approved messages." : "External prospect email is disabled. Draft and review only; the server hard lock remains authoritative."}</p></div>
    <OpportunityCommandCenter opportunities={opportunities} brokenLinks={brokenLinks} syncedLinks={[]} actionLogs={[]}/>
    <section className="overflow-hidden rounded-xl border border-border bg-surface-raised"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-accent">Workspace suppression ledger</p><h2 className="mt-1 font-semibold">Suppressed recipients</h2><p className="mt-1 text-xs text-text-secondary">Addresses are masked in this view. The ledger is scoped to the active domain.</p></div><span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] text-text-tertiary">{maskedSuppressions.length} shown</span></div>{maskedSuppressions.length ? <ul className="divide-y divide-border">{maskedSuppressions.map((item, index) => <li key={`${item.email}-${item.created_at}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs"><span className="font-mono text-foreground">{item.email}</span><span className="text-text-tertiary">{item.reason.replaceAll("_", " ")} · {new Date(item.created_at).toLocaleDateString()}</span></li>)}</ul> : <p className="px-5 py-5 text-xs text-text-secondary">No domain-specific suppressions are recorded.</p>}</section>
  </div>;
}
