"use client";

import { useState } from "react";
import { EvidenceCategoryBadge } from "@/components/evidence-category-badge";

type Check = { url: string; state: string; httpStatus: number | null; error?: string };
type Result = { checked: Check[]; ownDomainBrokenCount: number; recoveryRowsCreated: number; externalBrokenCount: number; note: string; provider: string; model: string; locale: string; observedAt: string };

function parseCitationList(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const value: unknown = JSON.parse(trimmed);
    const raw = Array.isArray(value) ? value : value && typeof value === "object" && "urls" in value ? (value as { urls: unknown }).urls : null;
    if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean);
  } catch { /* CSV/text input below */ }
  return [...new Set(trimmed.split(/[\r\n,;\t]+/).flatMap(line => line.match(/https?:\/\/[^\s,"']+/g) ?? []).map(url => url.replace(/[)\]}>'".]+$/, "")))];
}

export function CitationEvidenceImport({ auditId, domain }: { auditId?: string; domain?: string }) {
  const [text, setText] = useState("");
  const [provider, setProvider] = useState("External citation import");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 100_000) { setError("Choose a CSV or JSON file smaller than 100 KB."); return; }
    setText(await file.text()); setError("");
  }
  async function submit() {
    const urls = parseCitationList(text);
    if (!auditId) { setError("Run an audit in this workspace before importing evidence."); return; }
    if (!urls.length || urls.length > 50) { setError("Add between 1 and 50 HTTP(S) URLs."); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/evidence/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId, urls, provider, prompt }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Import failed.");
      setResult(body as Result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.025] p-4" aria-label="Import citation evidence"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-white">Import Citation Evidence (CSV / JSON / URL Paste)</h3><p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-400">Bring URL observations from Peec AI, Otterly, Profound, Ahrefs Brand Radar, GSC, or server logs. CiteMend re-checks every destination. Imported provider details remain customer supplied.</p></div><EvidenceCategoryBadge category="observation" /></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-[11px] text-slate-400">Evidence source<input value={provider} onChange={e => setProvider(e.target.value)} maxLength={100} className="mt-1 min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-2 text-xs text-white" placeholder="Peec AI, GSC, server logs..." /></label><label className="text-[11px] text-slate-400">Prompt (if known)<input value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={4000} className="mt-1 min-h-9 w-full rounded-md border border-white/10 bg-black/20 px-2 text-xs text-white" placeholder="Which tools help ...?" /></label></div><textarea value={text} onChange={e => setText(e.target.value)} rows={4} className="mt-3 w-full rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] leading-5 text-slate-200" placeholder={'Paste one URL per line, CSV, or JSON: { "urls": ["https://example.com/page"] }'} aria-label="Citation URL list" /><div className="mt-2 flex flex-wrap items-center gap-2"><label className="cursor-pointer rounded-md border border-white/10 px-3 py-2 text-[11px] text-slate-300 hover:bg-white/5">Upload CSV / JSON<input type="file" accept=".csv,.json,text/csv,application/json" onChange={e => void upload(e.target.files?.[0])} className="sr-only" /></label><button type="button" onClick={() => void submit()} disabled={busy || !auditId} className="rounded-md bg-emerald-300 px-3 py-2 text-[11px] font-semibold text-[#07110d] disabled:opacity-50">{busy ? "Checking URLs…" : "Import and verify"}</button>{domain && <span className="text-[10px] text-slate-500">Workspace: {domain}</span>}</div>{!auditId && <p className="mt-2 text-[10px] text-amber-200">Run a workspace audit to select the evidence owner and enable import.</p>}{error && <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p>}{result && <div className="mt-3 rounded-lg border border-white/[.08] bg-black/15 p-3"><div className="flex flex-wrap items-center gap-2"><EvidenceCategoryBadge category="observation" /><EvidenceCategoryBadge category="http" /><p className="text-[11px] text-slate-300">{result.checked.length} checked · {result.ownDomainBrokenCount} own-domain 404/410 · {result.externalBrokenCount} external broken sources · {result.recoveryRowsCreated} queued for review</p></div><p className="mt-2 text-[10px] text-slate-500">{result.note}</p><div className="mt-2 max-h-36 space-y-1 overflow-y-auto">{result.checked.map(row => <div key={row.url} className="flex flex-wrap justify-between gap-2 text-[10px]"><span className="break-all font-mono text-slate-400">{row.url}</span><span className="font-mono text-slate-300">{row.state} · HTTP {row.httpStatus ?? "unknown"}</span></div>)}</div></div>}</section>;
}
