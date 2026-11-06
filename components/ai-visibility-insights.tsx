"use client";

import { useEffect, useState } from "react";

type Result = {
  predictions: { prompt_query: string; model_name: string; url: string; decay_risk_score: number; citation_rate: number; confidence_interval_low: number; confidence_interval_high: number; sample_size: number; sample_size_warning: string | null; signals: { declining_citation_frequency: boolean; content_stale_over_180_days: boolean; competitors_publish_fresher_pages: boolean; increasing_competitor_source_velocity: boolean; competitor_source_velocity: number } }[];
  sourceReplacementAlerts: { id: string; prompt_query: string; event_type: string; source_url: string; new_replacement_url: string | null; replaced_by_competitor: boolean; detected_at: string }[];
  benchmarks: { category: string; contributing_workspaces: number; citation_rate: number; sample_size: number }[];
};

export function AiVisibilityInsights({ domain, compact = false }: { domain: string; compact?: boolean }) {
  const [data, setData] = useState<Result | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!domain) return;
    let active = true;
    fetch(`/api/intelligence/predictions?domain=${encodeURIComponent(domain)}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("unavailable");
      return response.json() as Promise<Result>;
    }).then((result) => { if (active) setData(result); }).catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [domain]);

  if (!domain) return <p className="mt-1 text-xs text-slate-400">Run an audit to build citation history for this panel.</p>;
  if (unavailable) return <p className="mt-1 text-xs text-slate-400">Citation predictions are currently unavailable.</p>;
  if (!data) return <div aria-label="Loading citation intelligence" aria-busy="true" className="mt-4 space-y-3"><div className="h-4 w-48 animate-pulse rounded bg-white/10" /><div className="h-20 animate-pulse rounded-lg bg-white/[.04]" /><div className="h-28 animate-pulse rounded-lg bg-white/[.04]" /></div>;
  if (compact) {
    const highRisk = data.predictions.filter((prediction) => prediction.decay_risk_score >= 60).length;
    return <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-amber-300/20 px-3 py-1 text-amber-200">{data.sourceReplacementAlerts.length} source-change alerts</span><span className="rounded-full border border-rose-300/20 px-3 py-1 text-rose-200">{highRisk} high decay risks</span><span className="rounded-full border border-white/10 px-3 py-1 text-slate-300">{data.predictions.length} cited URL estimates with 95% intervals</span></div>;
  }
  return <div className="mt-4 space-y-4">
    <section aria-label="Source replacement alerts"><h3 className="text-xs font-semibold text-amber-200">Source Replacement Alerts</h3>{data.sourceReplacementAlerts.length ? <ul className="mt-2 space-y-2">{data.sourceReplacementAlerts.slice(0, 5).map((event) => <li key={event.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs"><p className="font-medium text-slate-200">{event.event_type.replaceAll("_", " ")} · {event.prompt_query}</p><p className="mt-1 break-all text-slate-400">{event.source_url}{event.new_replacement_url ? ` → ${event.new_replacement_url}` : ""}</p>{event.replaced_by_competitor && <span className="mt-1 inline-block text-amber-200">Competitor/publisher replacement</span>}</li>)}</ul> : <p className="mt-1 text-xs text-slate-500">No recorded source replacements or broken cited URLs.</p>}</section>
    <section aria-label="Predictive citation decay"><h3 className="text-xs font-semibold text-rose-200">Predictive Citation Decay</h3>{data.predictions.length ? <ul className="mt-2 space-y-2">{data.predictions.slice(0, 8).map((prediction) => <li key={`${prediction.prompt_query}:${prediction.model_name}:${prediction.url}`} className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-slate-200">Decay risk {prediction.decay_risk_score}/100 · {prediction.model_name}</span><span className="rounded-full border border-white/10 px-2 py-1 text-[10px]">n = {prediction.sample_size} runs</span></div><p className="mt-1 break-all text-slate-400">{prediction.url}</p><p className="mt-1 text-slate-400">95% Wilson interval for citation rate: {prediction.confidence_interval_low.toFixed(1)}%–{prediction.confidence_interval_high.toFixed(1)}%</p>{prediction.sample_size_warning && <p className="mt-1 text-amber-200">{prediction.sample_size_warning}</p>}<p className="mt-1 text-slate-500">Signals: {prediction.signals.declining_citation_frequency ? "citation frequency declining · " : ""}{prediction.signals.content_stale_over_180_days ? "content over 180 days old · " : ""}{prediction.signals.competitors_publish_fresher_pages ? "fresher competitor dates observed · " : ""}{prediction.signals.increasing_competitor_source_velocity ? "competitor sources accelerating · " : ""}{prediction.signals.competitor_source_velocity} other source URLs in recent prompt history.</p></li>)}</ul> : <p className="mt-1 text-xs text-slate-500">A current citation is needed before decay risk can be estimated.</p>}</section>
    {data.benchmarks.map((benchmark) => <p key={benchmark.category} className="rounded-lg border border-cyan-300/10 bg-cyan-300/[.03] p-3 text-xs text-slate-400">Opt-in {benchmark.category.replaceAll("_", " ")} benchmark ({benchmark.contributing_workspaces} workspaces): {benchmark.citation_rate.toFixed(1)}% citation rate across {benchmark.sample_size} observations. Only shown after five or more workspaces in that category opt in.</p>)}
    <p className="text-[10px] text-slate-500">Risk scores are heuristic indicators from saved observations and visible publication dates; confidence intervals describe observed citation frequency, not future outcomes.</p>
  </div>;
}
