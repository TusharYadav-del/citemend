"use client";

import { useState } from "react";
import Link from "next/link";

export function CaseStudyGenerator({ auditId }: { auditId: string }) {
  const [anonymize, setAnonymize] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true); setError(null); setUrl(null);
    try {
      const response = await fetch("/api/case-studies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId, anonymize }) });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error ?? "A verified recovery is required before creating a case study.");
      setUrl(body.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The case study could not be generated."); }
    finally { setLoading(false); }
  }

  return <section aria-label="Verified recovery case study" className="mb-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[.035] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">Recovery Case Study</h2><p className="mt-1 text-xs text-slate-400">Create a shareable before-and-after report from verified recovery evidence.</p></div><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={anonymize} onChange={(event) => setAnonymize(event.target.checked)} className="size-4 accent-emerald-300" /> Anonymize customer details</label></div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={() => void generate()} disabled={loading} className="min-h-9 rounded-lg bg-[#37F5A0] px-3 text-xs font-bold text-[#07110d] disabled:opacity-60">{loading ? "Building evidence…" : "Generate case study"}</button>{url && <Link href={url} target="_blank" className="text-xs font-medium text-emerald-200 underline decoration-emerald-200/40 underline-offset-4">Open shareable case study</Link>}</div>
    {error && <p role="alert" className="mt-2 text-xs text-amber-100">{error}</p>}
  </section>;
}
