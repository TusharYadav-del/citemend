import Link from "next/link";
import type { UserAuditHistoryItem } from "@/lib/audit-history";

export function AgencyWorkspaceHub({ audits, selectedDomain }: { audits: UserAuditHistoryItem[]; selectedDomain: string }) {
  const domains = [...new Set(audits.map(item => item.domain))].sort();
  if (!domains.length) return null;
  return <section id="agency-workspace-hub" aria-label="Agency client workspaces" className="mb-6 rounded-xl border border-white/10 bg-white/[.025] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-emerald-300">Agency hub</p><h2 className="mt-1 text-lg font-semibold text-white">Client workspaces</h2><p className="mt-1 text-xs text-slate-400">Open a client workspace or its monthly print report. Each card uses saved audits owned by your account or organization.</p></div><span className="text-xs text-slate-400">{domains.length} workspace{domains.length === 1 ? "" : "s"}</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{domains.map(domain => {
      const rows = audits.filter(item => item.domain === domain);
      const latest = rows.find(item => ["completed", "partial", "mock_completed"].includes(item.status));
      const broken = latest?.broken_links.filter(link => link.http_status === 404 || link.http_status === 410).length ?? 0;
      return <article key={domain} className={`rounded-lg border p-4 ${selectedDomain === domain ? "border-emerald-300/40 bg-emerald-300/[.05]" : "border-white/10 bg-black/10"}`}>
        <h3 className="break-all text-sm font-semibold text-white">{domain}</h3>
        <p className="mt-2 text-xs text-slate-400">{rows.length} saved scan{rows.length === 1 ? "" : "s"} · {broken} confirmed 404/410 destination{broken === 1 ? "" : "s"} in latest completed scan</p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs"><Link href={`/dashboard?domain=${encodeURIComponent(domain)}`} className="text-emerald-300 underline underline-offset-2">Open workspace</Link>{latest && <Link href={`/dashboard/reports/monthly?domain=${encodeURIComponent(domain)}`} className="text-cyan-200 underline underline-offset-2">Monthly report</Link>}</div>
      </article>;
    })}</div>
  </section>;
}
