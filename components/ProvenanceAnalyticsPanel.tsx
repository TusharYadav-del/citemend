"use client";

import { useEffect, useState } from "react";

type UrlRow = { url: string; retrievedRuns: number; renderedRuns: number; retrievalRate: number; provenance: string; citationAuthority: boolean; thirdPartySource: boolean; domainInfluence: boolean; retrievalConfidence95: { low: number; high: number } };
type Tuple = { promptQuery: string; provider: string; model: string; runs: number; consistencyIndex: number | null; lowSampleWarning: boolean; urls: UrlRow[] };
type Payload = { retrievalConsistency: { tuples: Tuple[]; limits: string[] }; events: { claimedCrawlerFetches: number; verifiedCrawlerFetches: number; aiReferrals: number; shopifyOrders: number; matchedReferralOrderJourneys: number; verifiedCrawlerShare: number | null }; eventSampleCount: number; eventWindowDays: number };

function percent(value: number) { return `${Math.round(value * 100)}%`; }

export default function ProvenanceAnalyticsPanel({ domain }: { domain?: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!domain) return;
    let cancelled = false;
    fetch(`/api/provenance?domain=${encodeURIComponent(domain)}`, { cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Provenance analytics are unavailable.");
      return result as Payload;
    }).then(result => { if (!cancelled) { setPayload(result); setError(""); } }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Provenance analytics are unavailable."); });
    return () => { cancelled = true; };
  }, [domain]);

  if (!domain) return null;
  return <section aria-label="AI provenance analytics" className="mb-6 rounded-xl border border-white/10 bg-white/[0.025] p-5">
    <div className="mb-4"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-cyan-300">Provenance</p><h2 className="mt-1 text-lg font-semibold text-white">Retrieval, citations &amp; influence</h2><p className="mt-1 text-xs leading-5 text-slate-400">Retrieved sources and links rendered in saved answers are tracked separately. Repeated prompt checks show URL-level consistency with confidence bounds.</p></div>
    {error && <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">{error}</p>}
    {!payload && !error && <p className="text-xs text-slate-500">Loading provenance records…</p>}
    {payload && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[["Crawler requests", payload.events.claimedCrawlerFetches], ["Verified via source metadata", payload.events.verifiedCrawlerFetches], ["AI referrals · 30d", payload.events.aiReferrals], ["Shopify orders · 30d", payload.events.shopifyOrders], ["Referral to order journeys", payload.events.matchedReferralOrderJourneys]].map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p></div>)}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Crawler user-agent labels alone are unverified. {payload.eventSampleCount} signed events shown from the last {payload.eventWindowDays} days{payload.events.verifiedCrawlerShare === null ? "." : ` · ${percent(payload.events.verifiedCrawlerShare)} of labeled crawler requests included trusted verification metadata.`}</p>
      {payload.retrievalConsistency.tuples.length ? <div className="mt-5 space-y-3">{payload.retrievalConsistency.tuples.map((tuple, index) => <article key={`${tuple.promptQuery}-${tuple.provider}-${tuple.model}-${index}`} className="rounded-lg border border-white/10 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-medium text-white">{tuple.promptQuery}</h3><p className="mt-1 text-[11px] text-slate-500">{tuple.provider} · {tuple.model} · {tuple.runs} saved runs{tuple.lowSampleWarning ? " · low sample" : ""}</p></div><span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-200">Consistency {tuple.consistencyIndex === null ? "—" : `${tuple.consistencyIndex}%`}</span></div>
        {tuple.urls.length > 0 && <div className="mt-3 space-y-2">{tuple.urls.slice(0, 8).map(item => <div key={item.url} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2 text-[11px]"><a className="max-w-full break-all text-slate-300 underline decoration-white/20 underline-offset-2" href={item.url} target="_blank" rel="noreferrer">{item.url}</a><span className="text-slate-500">retrieved {percent(item.retrievalRate)} · rendered {percent(item.renderedRuns / tuple.runs)} · 95% CI {percent(item.retrievalConfidence95.low)}–{percent(item.retrievalConfidence95.high)} · {item.citationAuthority ? "Citation authority" : item.domainInfluence ? "Potential domain influence mention" : item.thirdPartySource ? "Third-party source" : item.provenance}</span></div>)}</div>}
      </article>)}</div> : <p className="mt-5 rounded-lg border border-dashed border-white/10 p-4 text-xs text-slate-500">Saved observations will appear here after the next audit or citation import. External imports do not imply internal retrieval.</p>}
      <p className="mt-3 text-[10px] leading-4 text-slate-600">Domain influence is a potential signal when a third-party source is listed and the answer mentions the workspace name; the source page is not independently checked for that mention. Consistency uses mean pairwise Jaccard overlap between retrieved URL sets.</p>
    </>}
  </section>;
}
