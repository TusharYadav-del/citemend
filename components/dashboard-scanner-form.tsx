"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/workspace-provider";
import { useRouter } from "next/navigation";

export function DashboardScannerForm() {
  const { domains, activeDomain } = useWorkspace();
  const [domain, setDomain] = useState(activeDomain || domains[0] || "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [jobId, setJobId] = useState("");
  const [reportHref, setReportHref] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setJobId(""); setReportHref("");
    try {
      const prompts = prompt.split("\n").map(value => value.trim()).filter(Boolean);
      const response = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ domain, buyerPrompt: prompts[0], buyerPrompts: prompts }) });
      const data = await response.json() as { error?: string; jobId?: string; auditId?: string };
      if (!response.ok) throw new Error(data.error ?? "The audit could not be started.");
      setJobId(data.jobId ?? ""); setMessage(data.jobId ? "Audit queued. Live job progress is available in the top bar." : "Audit request accepted.");
      if (data.auditId) setReportHref(`/audit/${encodeURIComponent(data.auditId)}`);
      if (data.jobId) window.dispatchEvent(new CustomEvent("citemend:job-created", { detail: data.jobId }));
      router.refresh();
      if (data.jobId) void monitorJob(data.jobId);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The audit could not be started."); }
    finally { setBusy(false); }
  }
  async function monitorJob(id: string) {
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise(resolve => window.setTimeout(resolve, 3000));
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: "no-store" });
        const status = await response.json() as { status?: string; error?: string; result?: { report?: { id?: string } } };
        if (!response.ok) continue;
        if (status.status === "completed") { const reportId = status.result?.report?.id; if (reportId) setReportHref(`/audit/${encodeURIComponent(reportId)}`); setMessage("Audit completed. The workspace has refreshed with its saved domain and evidence."); router.refresh(); return; }
        if (status.status === "failed") { setMessage(status.error ?? "The audit failed after automatic retries."); router.refresh(); return; }
      } catch { /* Keep polling; the job record is the source of truth. */ }
    }
    setMessage("Audit is still processing. Its progress remains available in the command bar.");
  }
  return <form onSubmit={submit} className="mt-5 grid gap-4 rounded-xl border border-border bg-surface p-5">
    <label className="grid gap-1.5 text-xs text-text-secondary">Public domain<input required type="text" value={domain} onChange={event => setDomain(event.target.value)} placeholder="example.com" className="rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground" /></label>
    <label className="grid gap-1.5 text-xs text-text-secondary">Buyer questions <span className="text-[10px] text-text-tertiary">Enter one or more questions, one per line.</span><textarea required minLength={8} maxLength={4000} rows={4} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={"Which product is best for…?\nHow does this compare with…?"} className="rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground" /></label>
    <div className="flex flex-wrap items-center gap-3"><button disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-background disabled:opacity-50">{busy && <span className="size-3 animate-spin rounded-full border-2 border-background/30 border-t-background" />}{busy ? "Starting audit…" : "Run live audit"}</button><p role="status" className="text-xs text-text-secondary">{message}</p></div>
    {jobId && <p className="font-mono text-[10px] text-text-tertiary">Job {jobId}</p>}
    {reportHref && <Link href={reportHref} className="text-sm font-semibold text-accent-strong hover:underline">Open executive audit report →</Link>}
  </form>;
}
