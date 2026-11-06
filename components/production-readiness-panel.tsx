"use client";

import { useEffect, useState } from "react";
import type { ReadinessReport, ReadinessStatus } from "@/lib/readiness-doctor";

const statusStyles: Record<ReadinessStatus, string> = {
  PASS: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
  WARN: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  MISSING: "border-rose-300/25 bg-rose-300/10 text-rose-100",
};

export default function ProductionReadinessPanel() {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/health/readiness", { cache: "no-store" });
      const body = await response.json() as ReadinessReport | { error?: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Readiness checks could not be loaded.");
      setReport(body as ReadinessReport);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Readiness checks could not be loaded.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    async function loadInitialReport() {
      try {
        const response = await fetch("/api/health/readiness", { cache: "no-store" });
        const body = await response.json() as ReadinessReport | { error?: string };
        if (!response.ok) throw new Error("error" in body ? body.error : "Readiness checks could not be loaded.");
        if (active) setReport(body as ReadinessReport);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Readiness checks could not be loaded.");
      } finally { if (active) setLoading(false); }
    }
    void loadInitialReport();
    return () => { active = false; };
  }, []);

  return <section aria-labelledby="production-readiness-title" className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="production-readiness-title" className="text-sm font-semibold text-white">Production Readiness</h2><p className="mt-1 text-xs text-slate-400">Live checks for database security, application providers, email, cron, and billing configuration.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-slate-200 hover:border-emerald-300/40 disabled:opacity-50">{loading ? "Checking…" : "Refresh checks"}</button>
    </div>
    {loading && !report ? <div role="status" className="mt-4 space-y-2"><span className="sr-only">Checking production configuration</span>{[1, 2, 3].map((row) => <div key={row} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />)}</div> : null}
    {error && <p role="alert" className="mt-4 rounded-lg border border-rose-300/20 bg-rose-300/[0.06] p-3 text-sm text-rose-100">{error}</p>}
    {report && <>
      <div className="mt-4 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyles[report.status]}`}>Overall: {report.status}</span><span className="text-xs text-slate-500">Checked {new Date(report.checkedAt).toLocaleString()}</span></div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {report.checks.map((check) => <li key={check.id} className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
          <div className="flex items-start justify-between gap-2"><h3 className="text-xs font-medium text-slate-100">{check.label}</h3><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyles[check.status]}`}>{check.status}</span></div>
          <p className="mt-1 text-xs text-slate-400">{check.summary}</p>
          {check.details.map((detail) => <p key={detail} className="mt-1 break-words font-mono text-[10px] leading-4 text-slate-500">{detail}</p>)}
        </li>)}
      </ul>
      {report.databaseSetupPending && <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] p-3"><p className="text-xs leading-5 text-amber-100">The database schema or RLS setup is incomplete. Download and apply the consolidated migration in the Supabase SQL Editor, then refresh these checks.</p><a href="/api/health/readiness?format=sql" download className="mt-2 inline-flex rounded-lg border border-amber-200/25 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-200/10">Download database setup SQL</a></div>}
    </>}
  </section>;
}
