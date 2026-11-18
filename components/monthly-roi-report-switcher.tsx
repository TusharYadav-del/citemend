"use client";

import { useRouter } from "next/navigation";

export function MonthlyRoiReportSwitcher({ domains, selectedDomain, month }: { domains: string[]; selectedDomain: string; month: string }) {
  const router = useRouter();
  return <form className="print-hide mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4" onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const domain = String(form.get("domain") ?? "");
    const reportMonth = String(form.get("month") ?? "");
    if (domain && reportMonth) router.push(`/dashboard/reports/monthly?domain=${encodeURIComponent(domain)}&month=${encodeURIComponent(reportMonth)}`);
  }}>
    <label className="grid gap-1 text-xs text-slate-300">Client workspace
      <select name="domain" aria-label="Choose client workspace" defaultValue={selectedDomain} className="min-h-10 min-w-56 rounded-lg border border-white/10 bg-[#101719] px-3 text-sm text-white">
        {domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
      </select>
    </label>
    <label className="grid gap-1 text-xs text-slate-300">Report month
      <input name="month" aria-label="Choose report month" type="month" defaultValue={month} className="min-h-10 rounded-lg border border-white/10 bg-[#101719] px-3 text-sm text-white" />
    </label>
    <button type="submit" className="min-h-10 rounded-lg bg-emerald-300 px-4 text-xs font-semibold text-[#07110d]">Open report</button>
  </form>;
}
