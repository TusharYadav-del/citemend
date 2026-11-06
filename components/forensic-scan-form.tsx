"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import type { ForensicTeaserReport } from "@/lib/forensic-teaser";

export function ForensicScanForm({ initialDomain = "", agencyName }: { initialDomain?: string; agencyName?: string }) {
  const [domain, setDomain] = useState(initialDomain);
  const [buyerPrompt, setBuyerPrompt] = useState("");
  const [report, setReport] = useState<ForensicTeaserReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null); setReport(null);
    try {
      const response = await fetch("/api/forensics/teaser", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, buyerPrompt }) });
      const body = await response.json() as ForensicTeaserReport | { error?: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "The forensic scan could not be completed.");
      setReport(body as ForensicTeaserReport);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The forensic scan could not be completed."); }
    finally { setLoading(false); }
  }

  return <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
    <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-[#0D1119] p-5 sm:p-6">
      {agencyName && <p className="mb-4 rounded-lg border border-emerald-300/15 bg-emerald-300/[.04] px-3 py-2 text-xs text-emerald-100">Partner scan prepared with {agencyName.slice(0, 100)}</p>}
      <label htmlFor="forensic-domain" className="block text-xs font-semibold text-slate-200">Your public domain</label>
      <input id="forensic-domain" required type="text" autoComplete="url" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white placeholder:text-slate-600 focus:border-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/20" />
      <label htmlFor="forensic-prompt" className="mt-5 block text-xs font-semibold text-slate-200">One buyer-intent prompt</label>
      <textarea id="forensic-prompt" required minLength={8} maxLength={4000} rows={4} value={buyerPrompt} onChange={(event) => setBuyerPrompt(event.target.value)} placeholder="What is the best platform for managing customer support at a growing SaaS company?" className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm leading-6 text-white placeholder:text-slate-600 focus:border-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/20" />
      <p className="mt-2 text-[11px] leading-5 text-slate-500">One prompt per scan. The scan checks public pages and a modeled Groq answer with Tavily search context when configured.</p>
      <button type="submit" disabled={loading} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#37F5A0] px-4 text-sm font-bold text-[#07110d] transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60">{loading ? "Checking public evidence…" : "Run free forensic scan"}</button>
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/[.06] p-3 text-xs text-rose-100">{error}</p>}
    </form>
    <div aria-live="polite" className="min-h-52 rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6">
      {!report && !loading && <div className="flex h-full min-h-40 flex-col justify-center"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-slate-500">Evidence preview</p><h2 className="mt-3 text-xl font-semibold text-white">Check what this prompt can reach.</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">We’ll inspect public discoverability signals, visible page freshness and schema, and URL mentions from one modeled answer. Confirmed HTTP evidence stays separate from diagnostic hypotheses.</p></div>}
      {loading && <div role="status" className="flex min-h-40 flex-col justify-center"><span className="sr-only">Forensic scan is running</span><div className="h-3 w-28 animate-pulse rounded bg-white/10" /><div className="mt-4 h-7 w-4/5 animate-pulse rounded bg-white/10" /><div className="mt-3 h-14 animate-pulse rounded bg-white/[.05]" /><p className="mt-4 text-xs text-slate-500">Verifying public URLs through DNS-pinned HTTP checks…</p></div>}
      {report && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-slate-500">{report.status} · {report.domain}</p><span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.06] px-2.5 py-1 text-[10px] font-semibold text-cyan-100">{report.runMode === "groq_tavily_modeled_answer" ? "Modeled answer sample" : "Public-page checks only"}</span></div>
        <h2 className="mt-4 text-xl font-semibold text-white">{report.diagnosticSummary}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[.08] bg-black/15 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Broken or missing URL count</p><p className="mt-2 text-2xl font-semibold text-white">{report.citationSummary.brokenOrMissingCount ?? "—"}</p><p className="mt-1 text-[10px] text-slate-500">{report.citationSummary.brokenOrMissingCount === null ? "Unavailable without a modeled answer" : `${report.citationSummary.verifiedBrokenUrls} confirmed 404/410 · ${report.citationSummary.missingCitationCount} missing same-domain mention`}</p></div>
          <div className="rounded-xl border border-white/[.08] bg-black/15 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Homepage status</p><p className="mt-2 font-mono text-2xl font-semibold text-white">{report.pageEvidence.httpStatus ?? "unknown"}</p><p className="mt-1 text-[10px] text-slate-500">DNS-pinned public HTTP check</p></div>
          <div className="rounded-xl border border-white/[.08] bg-black/15 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Observed blocker types</p><p className="mt-2 text-2xl font-semibold text-white">{new Set(report.findings.map((item) => item.kind)).size}</p><p className="mt-1 text-[10px] text-slate-500">in this single scan</p></div>
        </div>
        {report.findings.length > 0 ? <ul className="mt-4 space-y-2">{report.findings.map((finding) => <li key={finding.kind} className="rounded-lg border border-white/[.07] bg-black/10 p-3"><h3 className="text-xs font-semibold text-slate-100">{finding.kind.replaceAll("_", " ")}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{finding.observableEvidence[0]}</p></li>)}</ul> : <p className="mt-4 rounded-lg border border-emerald-300/15 bg-emerald-300/[.04] p-3 text-xs text-emerald-100">No blocker signal was observed in this one pass. This is not proof that every AI system cites this domain.</p>}
        <div className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/[.045] p-4"><p className="text-sm font-semibold text-white">Connect Workspace or Join Design Partner Program to Unlock Full Recovery &amp; 301 Rollback</p><p className="mt-1 text-xs leading-5 text-slate-400">Get workspace-scoped evidence, verified destination mapping, and human-approved recovery controls.</p><div className="mt-3 flex flex-wrap gap-2"><Link href="/dashboard" className="inline-flex min-h-9 items-center rounded-lg bg-[#37F5A0] px-3 text-xs font-bold text-[#07110d]">Connect Workspace</Link><Link href="/design-partners" className="inline-flex min-h-9 items-center rounded-lg border border-white/15 px-3 text-xs font-semibold text-slate-100 hover:border-emerald-300/40">Join Design Partner Program</Link></div></div>
        <details className="mt-4 rounded-lg border border-white/[.07] p-3"><summary className="cursor-pointer text-xs font-medium text-slate-300">Evidence and limits</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200">Observable evidence</p><ul className="mt-2 space-y-1 text-[11px] text-slate-400"><li>HTTP status: {report.pageEvidence.httpStatus ?? "unknown"}</li><li>Sitemap available: {report.pageEvidence.sitemapCheckAvailable ? "yes" : "no"}; homepage listed: {report.pageEvidence.homepageInSitemap === null ? "unknown" : String(report.pageEvidence.homepageInSitemap)}</li><li>Robots allowed: {report.pageEvidence.robotsAllows === null ? "unknown" : String(report.pageEvidence.robotsAllows)}</li><li>JSON-LD blocks: {report.pageEvidence.structuredDataBlocks}</li><li>Modified: {report.pageEvidence.lastModified ?? "no visible timestamp"}</li></ul></div><div><p className="text-[10px] font-semibold uppercase tracking-wide text-amber-100">Diagnostic hypotheses</p><ul className="mt-2 space-y-1 text-[11px] leading-5 text-slate-400">{report.findings.flatMap((finding) => finding.diagnosticHypotheses).slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul></div></div>{report.limits.map((limit) => <p key={limit} className="mt-2 text-[10px] leading-4 text-slate-500">{limit}</p>)}</details>
      </>}
    </div>
  </div>;
}
