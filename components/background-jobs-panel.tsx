"use client";
import { useEffect, useState } from "react";

type Job = { id: string; workspace_domain: string; job_type: string; status: string; progress_percent: number; current_step_label: string; attempt_count: number; max_attempts: number; error_message: string | null; updated_at: string };
const titles: Record<string, string> = { audit_scan: "Buyer prompt audit", audit_enrichment: "Citation opportunity analysis", listicle_crawl: "Publisher and listicle crawl", ecommerce_sync: "Ecommerce catalog sync" };

export function BackgroundJobsPanel({ domain }: { domain?: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.jobs)) return;
        const visible = (body.jobs as Job[]).filter(job => !domain || job.workspace_domain === domain);
        if (active) setJobs(visible);
        if (active && visible.some(job => ["queued", "running", "retrying"].includes(job.status))) timer = setTimeout(refresh, 2500);
      } catch { /* transient job status failures do not affect the dashboard */ }
    };
    void refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [domain]);
  const visible = jobs.filter(job => ["queued", "running", "retrying"].includes(job.status)).slice(0, 5);
  if (!visible.length) return null;
  return <section aria-label="Background job progress" className="mb-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[.035] p-4"><h2 className="text-sm font-semibold text-white">Background work</h2><div className="mt-3 space-y-3">{visible.map(job => <article key={job.id} className="rounded-lg border border-white/[.07] bg-black/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-slate-200">{titles[job.job_type] ?? "Workspace job"} · {job.workspace_domain}</p><span className="text-[10px] uppercase tracking-wide text-emerald-200">{job.status}</span></div><p className="mt-1 text-[11px] text-slate-400">{job.current_step_label} · attempt {job.attempt_count}/{job.max_attempts}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-300 transition-[width]" style={{ width: `${Math.max(0, Math.min(100, job.progress_percent))}%` }} /></div></article>)}</div></section>;
}
