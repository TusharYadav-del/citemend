"use client";
import { useState } from "react";
import { EvidenceCategoryBadge } from "@/components/evidence-category-badge";

const tools = [
  { id: "entity-audit", label: "Compare site entities" },
  { id: "forensics", label: "Inspect claims & citations" },
  { id: "intelligence-graph", label: "Build recovery timeline" },
] as const;
type ForensicResult = {
  claimAudits?: { promptQuery: string; provider: string; model: string; issueCounts: Record<string, number>; claims: { text: string; issues: { code: string; confidence: string; evidence: string }[] }[]; citationMetadata: { title: string | null; authors: string[]; year: number | null; venue: string | null; url: string | null; doi: string | null; arxiv_id: string | null; pmid: string | null }[] }[];
  staleFactDiffs?: { category: string; url: string; updatedAt: string | null; evidence: string }[];
};
type Result = { endpoint: string; value: unknown };

export default function AuditAnalysisTools({ auditId }: { auditId?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  async function run(endpoint: string) {
    if (!auditId) return;
    setBusy(endpoint); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Analysis could not be completed.");
      setResult({ endpoint, value: data });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Analysis could not be completed."); }
    finally { setBusy(null); }
  }
  const forensic = result?.endpoint === "forensics" ? result.value as ForensicResult : null;
  return <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
    <h2 className="text-sm font-semibold">Entity, citation &amp; recovery analysis</h2>
    <p className="mt-1 text-xs text-slate-400">Runs against the latest saved audit and its recorded observations. Third-party results are evidence summaries, not private model reasoning.</p>
    <div className="mt-3 flex flex-wrap gap-2">{tools.map(item => <button key={item.id} type="button" disabled={!auditId || !!busy} onClick={() => void run(item.id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 disabled:opacity-40">{busy === item.id ? "Working…" : item.label}</button>)}</div>
    {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
    {result && <div className="mt-3 max-h-[36rem] overflow-auto rounded-lg border border-white/10 bg-black/30 p-3">
      <p className="mb-2 text-xs font-semibold text-emerald-300">{tools.find(item => item.id === result.endpoint)?.label}</p>
      <div className="mb-2 flex flex-wrap gap-2"><EvidenceCategoryBadge category="observation" /><EvidenceCategoryBadge category="http" /><EvidenceCategoryBadge category="estimate" /></div>
      {forensic ? <>
        <h3 className="mt-4 text-xs font-semibold text-white">Atomic claim review</h3>
        {forensic.claimAudits?.length ? forensic.claimAudits.slice(0, 10).map((audit, index) => <article key={`${audit.provider}-${audit.model}-${index}`} className="mt-2 rounded-lg border border-white/[.07] p-3">
          <p className="text-[10px] text-slate-400">{audit.provider} · {audit.model} · {audit.promptQuery}</p>
          <p className="mt-2 text-[10px] text-slate-500">{Object.entries(audit.issueCounts).filter(([, count]) => count > 0).map(([code, count]) => `${code}: ${count}`).join(" · ") || "No deterministic review flags"}</p>
          <div className="mt-2 space-y-2">{audit.claims.slice(0, 20).map((claim, claimIndex) => <div key={claimIndex} className="rounded bg-white/[.03] p-2"><p className="text-[11px] leading-5 text-slate-200">{claim.text}</p>{claim.issues.map((item, issueIndex) => <p key={issueIndex} className="mt-1 text-[10px] leading-4 text-amber-200">{item.code} ({item.confidence}): {item.evidence}</p>)}</div>)}</div>
          {audit.citationMetadata.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[10px] text-emerald-200">Normalized citation metadata</summary><ul className="mt-2 space-y-1">{audit.citationMetadata.map((meta, metaIndex) => <li key={metaIndex} className="break-all text-[10px] text-slate-400">{[meta.title, meta.authors.join(", "), meta.year, meta.venue, meta.doi && `DOI ${meta.doi}`, meta.pmid && `PMID ${meta.pmid}`, meta.arxiv_id && `arXiv ${meta.arxiv_id}`, meta.url].filter(Boolean).join(" · ") || "No scholarly metadata detected."}</li>)}</ul></details>}
        </article>) : <p className="mt-2 text-xs text-slate-400">No saved answer observations to decompose.</p>}
        <h3 className="mt-4 text-xs font-semibold text-white">Stale-fact and misattribution review</h3>
        {forensic.staleFactDiffs?.length ? forensic.staleFactDiffs.map((item, index) => <p key={index} className="mt-2 break-all rounded-lg border border-white/[.07] p-2 text-[10px] leading-4 text-slate-300"><span className="font-semibold text-amber-200">{item.category.replaceAll("_", " ")}</span> · {item.url} · {item.updatedAt ?? "date unknown"}<br />{item.evidence}</p>) : <p className="mt-2 text-xs text-slate-400">No stale timestamp or page-fact diff appeared in this scan.</p>}
        <p className="mt-3 text-[10px] leading-4 text-slate-500">Taxonomy labels are review signals. Fabrication is never asserted without human source verification; model-misread candidates are page comparisons, not causal findings.</p>
        <details className="mt-3"><summary className="cursor-pointer text-[10px] text-slate-400">Full evidence payload</summary><pre className="mt-2 whitespace-pre-wrap break-words text-[10px] leading-4 text-slate-400">{JSON.stringify(result.value, null, 2)}</pre></details>
      </> : <pre className="whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-300">{JSON.stringify(result.value, null, 2)}</pre>}
    </div>}
  </section>;
}
