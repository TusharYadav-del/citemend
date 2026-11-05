"use client";
import { useState } from "react";

const tools = [
  { id: "entity-audit", label: "Compare site entities" },
  { id: "forensics", label: "Inspect citation forensics" },
  { id: "intelligence-graph", label: "Build recovery timeline" },
] as const;
type Result = { endpoint: string; value: unknown };
export default function AuditAnalysisTools({ auditId }: { auditId?: string }) {
  const [busy, setBusy] = useState<string | null>(null); const [result, setResult] = useState<Result | null>(null); const [error, setError] = useState("");
  async function run(endpoint: string) { if (!auditId) return; setBusy(endpoint); setError(""); setResult(null); try { const response = await fetch(`/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Analysis could not be completed."); setResult({ endpoint, value: data }); } catch (caught) { setError(caught instanceof Error ? caught.message : "Analysis could not be completed."); } finally { setBusy(null); } }
  return <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4"><h2 className="text-sm font-semibold">Entity, citation &amp; recovery analysis</h2><p className="mt-1 text-xs text-slate-400">Runs against the latest saved audit and its recorded observations. Third-party results are evidence summaries, not private model reasoning.</p><div className="mt-3 flex flex-wrap gap-2">{tools.map(item => <button key={item.id} type="button" disabled={!auditId || !!busy} onClick={() => void run(item.id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 disabled:opacity-40">{busy === item.id ? "Working…" : item.label}</button>)}</div>{error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}{result && <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3"><p className="mb-2 text-xs font-semibold text-emerald-300">{tools.find(item => item.id === result.endpoint)?.label}</p><pre className="whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-300">{JSON.stringify(result.value, null, 2)}</pre></div>}</section>;
}
