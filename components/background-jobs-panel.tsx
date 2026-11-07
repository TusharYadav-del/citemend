"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, ChevronRight, RotateCw, X } from "lucide-react";
import { AlertBanner } from "@/components/ui/alert-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type Job = { id: string; workspace_domain: string; job_type: string; status: string; progress_percent: number; current_step_label: string; attempt_count: number; max_attempts: number; error_message: string | null; updated_at: string };
type JobDetail = { jobId: string; status: string; progressPercent: number; currentStepLabel: string; attemptCount: number; maxAttempts: number; nextRetryAt?: string | null; error?: string | null };
const titles: Record<string, string> = { audit_scan: "Buyer prompt audit", audit_enrichment: "Citation opportunity analysis", listicle_crawl: "Publisher crawl", ecommerce_sync: "Catalog sync" };
const stages = ["Queued", "Sitemap discovery", "Model probe", "SSRF URL verification", "pgvector matching", "Completed"];
const isActive = (status: string) => ["queued", "running", "retrying"].includes(status);

export function BackgroundJobsPanel({ domain }: { domain?: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      const body = await response.json() as { jobs?: Job[]; error?: string };
      if (!response.ok || !Array.isArray(body.jobs)) throw new Error(body.error || "Job status is unavailable.");
      const visible = body.jobs.filter(job => !domain || job.workspace_domain === domain);
      setJobs(current => JSON.stringify(current) === JSON.stringify(visible) ? current : visible); setError(null);
      setSelectedId(current => current && visible.some(job => job.id === current) ? current : visible.find(job => isActive(job.status))?.id ?? visible[0]?.id ?? null);
    } catch { setError("Could not load job progress. Try again."); }
    finally { setLoading(false); }
  }, [domain]);
  useEffect(() => {
    const initialTimer = setTimeout(() => { void refresh(); }, 0);
    const timer = setInterval(() => { void refresh(); }, 15_000);
    const onCreated = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === "string") setSelectedId(id);
      setOpen(true); void refresh();
    };
    window.addEventListener("citemend:job-created", onCreated);
    return () => { clearTimeout(initialTimer); clearInterval(timer); window.removeEventListener("citemend:job-created", onCreated); };
  }, [refresh]);
  const selectedActive = jobs.some(job => job.id === selectedId && isActive(job.status));
  useEffect(() => {
    if (!selectedId || !selectedActive) return;
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(selectedId)}`, { cache: "no-store" });
        const body = await response.json() as JobDetail & { error?: string };
        if (!response.ok) throw new Error(body.error || "Job progress is unavailable.");
        if (!alive) return;
        setDetail(current => JSON.stringify(current) === JSON.stringify(body) ? current : body);
        setJobs(current => {
          const next = current.map(job => job.id === selectedId && (job.status !== body.status || job.progress_percent !== body.progressPercent || job.current_step_label !== body.currentStepLabel || job.attempt_count !== body.attemptCount || job.error_message !== (body.error ?? null)) ? { ...job, status: body.status, progress_percent: body.progressPercent, current_step_label: body.currentStepLabel, attempt_count: body.attemptCount, max_attempts: body.maxAttempts, error_message: body.error ?? null } : job);
          return next.every((job, index) => job === current[index]) ? current : next;
        });
        if (!isActive(body.status)) void refresh();
      } catch { if (alive) setError("Could not refresh job progress. Try again."); }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 2500);
    return () => { alive = false; clearInterval(timer); };
  }, [selectedId, selectedActive, refresh]);
  const activeJobs = jobs.filter(job => isActive(job.status));
  const selected = jobs.find(job => job.id === selectedId) ?? activeJobs[0] ?? jobs[0];
  const shown = detail?.jobId === selected?.id ? detail : null;
  const progress = Math.max(0, Math.min(100, shown?.progressPercent ?? selected?.progress_percent ?? 0));
  return <div className="relative">
    <button type="button" onClick={() => setOpen(value => !value)} aria-haspopup="dialog" aria-expanded={open} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/[.08] bg-white/[.025] px-3 text-xs font-medium text-slate-200 hover:border-emerald-300/30 focus-visible:outline-2 focus-visible:outline-emerald-300"><Activity className={`size-4 ${activeJobs.length ? "text-emerald-300" : "text-slate-500"}`} /><span className="font-mono tabular-nums">{loading ? "Jobs…" : error ? "Jobs unavailable" : activeJobs.length ? `${activeJobs.length} active · ${activeJobs[0].progress_percent}%` : "Jobs idle"}</span><ChevronRight className={`size-3.5 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} /></button>
    {open && <div role="dialog" aria-label="Background job telemetry" className="absolute right-0 top-12 z-40 max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-white/[.12] bg-[#101722] p-4 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">Background jobs</h2><p className="mt-1 text-[11px] text-slate-500">Live worker progress for this workspace</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close job telemetry" className="rounded-md p-2 text-slate-400 hover:bg-white/5"><X className="size-4" /></button></div>
      {loading ? <div role="status" aria-label="Loading background jobs" className="mt-4 space-y-2"><Skeleton className="h-12" /><Skeleton className="h-20" /></div> : error ? <div className="mt-4"><AlertBanner tone="danger" title="Job progress is unavailable"><p>{error}</p><button type="button" onClick={() => void refresh()} className="mt-2 inline-flex items-center gap-1 font-semibold underline"><RotateCw className="size-3.5" />Retry</button></AlertBanner></div> : jobs.length === 0 ? <div className="mt-4"><EmptyState title="No jobs yet" description="Run an audit to see each background step here." action={<Link href="/#audit" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">Run an audit <ArrowRight className="size-3.5" /></Link>} /></div> : <>
        <div className="mt-4 space-y-1">{jobs.slice(0, 5).map(job => <button key={job.id} type="button" onClick={() => { setSelectedId(job.id); setDetail(null); }} aria-pressed={selected?.id === job.id} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs ${selected?.id === job.id ? "border-emerald-300/30 bg-emerald-300/[.06]" : "border-white/[.07] hover:bg-white/[.03]"}`}><span className="min-w-0"><span className="block truncate font-medium text-slate-100">{titles[job.job_type] ?? "Workspace job"}</span><span className="block truncate font-mono text-[10px] text-slate-500">{job.workspace_domain}</span></span><span className="shrink-0 font-mono text-[10px] text-emerald-200">{job.status}</span></button>)}</div>
        {selected && <div className="mt-4 border-t border-white/[.08] pt-4" aria-live="polite"><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-white">{progress}%</span><span className="font-mono text-[10px] text-slate-400">Attempt {shown?.attemptCount ?? selected.attempt_count}/{shown?.maxAttempts ?? selected.max_attempts}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Job progress"><div className="h-full rounded-full bg-emerald-300 transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-slate-200">{shown?.currentStepLabel ?? selected.current_step_label}</p>{selected.status === "retrying" && <p className="mt-1 text-[11px] text-amber-200">Retry scheduled{shown?.nextRetryAt ? ` for ${new Date(shown.nextRetryAt).toLocaleString()}` : ""}.</p>}{selected.error_message && <p className="mt-2 text-xs text-rose-200">{selected.error_message}</p>}<p className="mt-4 text-[10px] uppercase tracking-[.14em] text-slate-500">Typical scan stages</p><ol className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-slate-500">{stages.map((stage, index) => <li key={stage} className="rounded-md border border-white/[.06] p-2"><span className="font-mono text-emerald-300">{index + 1}.</span> {stage}</li>)}</ol><p className="mt-2 text-[10px] text-slate-500">The step label and progress above come from the saved job. Stage names describe the usual workflow.</p></div>}
      </>}
    </div>}
  </div>;
}
