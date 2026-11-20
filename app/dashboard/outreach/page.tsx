import { getDashboardPageData } from "@/lib/dashboard-page-data";
import OpportunityCommandCenter, { type Opportunity } from "@/components/OpportunityCommandCenter";

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const params = await searchParams; const data = await getDashboardPageData(params.domain);
  const enabled = process.env.OUTBOUND_EMAILS_ENABLED === "true";
  const audits = data.domain ? data.audits.filter(audit => audit.domain === data.domain) : data.audits;
  const ids = audits.map(audit => audit.id);
  let opportunities: Opportunity[] = [];
  if (ids.length) { const result = await data.db.from("citation_hijack_opportunities").select("*").in("audit_id", ids).order("composite_priority_score", { ascending: false }).limit(100); if (!result.error) opportunities = (result.data ?? []) as unknown as Opportunity[]; }
  const brokenLinks = audits.flatMap(audit => audit.broken_links.map(link => ({ ...link, auditId: audit.id, domain: audit.domain })));
  return <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Win / verified outreach</p><h2 className="mt-1 text-2xl font-semibold">1-Verified-Example Workbench</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">Draft-first outreach built around a verified broken citation and a reviewed replacement page.</p><div role="status" className={`mt-5 rounded-lg border p-4 text-sm ${enabled ? "border-success/20 bg-success/5 text-success" : "border-warning/20 bg-warning/5 text-warning"}`}><strong>{enabled ? "Outbound lock: enabled" : "Outbound lock: locked"}</strong><p className="mt-1 text-xs leading-5">{enabled ? "Sending is available only for explicitly approved messages." : "External prospect email is disabled. Draft and review only; the server hard lock remains authoritative."}</p></div><div className="mt-5"><OpportunityCommandCenter opportunities={opportunities} brokenLinks={brokenLinks} syncedLinks={[]} actionLogs={[]} /></div></div>;
}
