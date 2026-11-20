"use client";

import { useState } from "react";
import type { ExtractabilityBot, ExtractabilityFix, ExtractabilityPage } from "@/lib/extractability-audit";

type Report = { domain: string; pages: ExtractabilityPage[]; robotsAvailable: boolean; llmsTxtStatus: number | null; sitemapAvailable: boolean; scannedPageCount: number; fixes: ExtractabilityFix[]; limits: string[] };
const BOTS: ExtractabilityBot[] = ["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended"];

export function ExtractabilityAuditPanel({ auditId }: { auditId?: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function scan() {
    if (!auditId) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/extractability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId }) });
      const body = await response.json() as Report | { error?: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Scan failed.");
      setReport(body as Report);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The extractability scan failed."); }
    finally { setBusy(false); }
  }
  return <section className="mb-5 rounded-xl border border-border bg-surface-raised p-4" aria-label="Agent extractability audit">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-foreground">Agent Extractability &amp; Freshness</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-text-secondary">Deterministic public-page checks for crawler access, server-rendered text, navigation size, answer capsules, content signals, and visible update dates.</p></div><button type="button" onClick={() => void scan()} disabled={!auditId || busy} className="min-h-9 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{busy ? "Scanning…" : report ? "Rescan pages" : "Scan pages"}</button></div>
    {!auditId && <p className="mt-3 text-xs text-text-tertiary">Run an audit to select an owned domain.</p>}
    {error && <p role="alert" className="mt-3 text-xs text-rose-200">{error}</p>}
    {report && <><div className="mt-4 flex flex-wrap gap-2 text-[11px] text-text-secondary"><span className="rounded-md bg-surface-raised px-2 py-1">{report.scannedPageCount} pages sampled</span><span className="rounded-md bg-surface-raised px-2 py-1">robots.txt {report.robotsAvailable ? "available" : "unavailable"}</span><span className="rounded-md bg-surface-raised px-2 py-1">/llms.txt HTTP {report.llmsTxtStatus ?? "unknown"}</span><span className="rounded-md bg-surface-raised px-2 py-1">sitemap {report.sitemapAvailable ? "available" : "unavailable"}</span></div>
      {report.fixes.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{report.fixes.map(fix => <article key={fix.id} className="rounded-lg border border-border bg-surface-raised p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold text-foreground">{fix.title}</h3><span className="shrink-0 text-[10px] font-semibold text-emerald-200">Tier {fix.tier} · score {fix.priority}</span></div><p className="mt-2 text-[11px] leading-5 text-text-secondary">{fix.evidence}</p><p className="mt-2 text-[11px] leading-5 text-foreground">{fix.action}</p></article>)}</div> : <p className="mt-4 text-xs text-emerald-200">No remediation signals appeared in this sample.</p>}
      <details className="mt-4"><summary className="cursor-pointer text-xs font-medium text-text-secondary">Page measurements</summary><div className="mt-3 space-y-2">{report.pages.map(page => <article key={page.url} className="rounded-lg border border-border bg-surface-raised p-3"><p className="break-all text-[11px] font-medium text-foreground">{page.url}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-secondary"><span>HTTP {page.httpStatus ?? "unknown"}</span><span>SSR text {page.serverRendered ? "present" : "low/absent"}</span><span>{page.wordCount} visible words</span><span>nav links {page.navigationLinkCount}</span><span>capsule {page.answerCapsule.found ? `${page.answerCapsule.wordCount} words` : "missing"}</span><span>quotes {page.quotationDensity}%</span><span>numbers {page.statisticDensity} per 100 words</span><span>keyword repetition {page.keywordStuffing.detected ? `${page.keywordStuffing.repeatedTerm} (${page.keywordStuffing.ratio}%)` : "not flagged"}</span><span>updated {page.updatedAt ?? "unknown"}</span></div><div className="mt-2 flex flex-wrap gap-2">{BOTS.map(bot => <span key={bot} className={`rounded px-1.5 py-1 text-[9px] ${page.robots[bot] === false ? "bg-rose-400/10 text-rose-200" : page.robots[bot] === true ? "bg-emerald-400/10 text-emerald-200" : "bg-surface-soft text-text-secondary"}`}>{bot}: {page.robots[bot] === null ? "unknown" : page.robots[bot] ? "allowed" : "blocked"}</span>)}</div></article>)}</div></details>
      {report.limits.map(item => <p key={item} className="mt-2 text-[10px] leading-4 text-text-tertiary">{item}</p>)}
    </>}
  </section>;
}
