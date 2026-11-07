"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WEEKLY_OPERATING_TARGETS, REVENUE_MILESTONES, type FounderScorecard, EMPTY_FOUNDER_SCORECARD } from "@/lib/founder-os";

type Data = {
  weekStart: string;
  scorecard: FounderScorecard;
  revenue: { planPricedEstimatedMrrUsd: number; planPricedEstimatedArrUsd: number; activeSubscriptionCount: number; unpricedActiveSubscriptions: number; segmentMixEstimatedMrrUsd: Record<string, number>; measurementNote: string };
  operatingMetrics: { workspaceCount: number; activationPercent: number | null; meanTimeToFirstUsefulAuditMinutes: number | null; meanTimeToFirstRecoveryActionMinutes: number | null; redirectDeploymentVerificationPercent: number | null; evidenceCompletenessPercent: number | null; grossMarginEstimatePercent: number | null; grossMarginWarningWorkspaces: number; grrPercent: number | null; nrrPercent: number | null; measurementNote: string };
};

const fmt = (value: number | null, suffix = "") => value === null ? "Not measured" : `${Number(value.toFixed(1))}${suffix}`;
const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

export function FounderOsDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [scorecard, setScorecard] = useState<FounderScorecard>(EMPTY_FOUNDER_SCORECARD);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("Loading weekly scorecard…");

  useEffect(() => {
    let active = true;
    fetch("/api/founder-os", { cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Founder data is unavailable.");
      if (active) { setData(body); setScorecard(body.scorecard); setSaveState("Changes save automatically."); }
    }).catch(cause => { if (active) { setError(cause instanceof Error ? cause.message : "Founder data is unavailable."); setSaveState(""); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      setSaveState("Saving…");
      fetch("/api/founder-os", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scorecard) })
        .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not save scorecard."); setSaveState("Saved for this week."); })
        .catch(cause => setSaveState(cause instanceof Error ? cause.message : "Could not save scorecard."));
    }, 500);
    return () => clearTimeout(timer);
  }, [data, scorecard]);

  if (error) return <div role="alert" className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 text-sm text-amber-100">{error}</div>;
  if (!data) return <div role="status" className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map(item => <div key={item} className="h-32 animate-pulse rounded-2xl bg-white/[.04]" />)}</div>;
  const metrics = data.operatingMetrics;
  const cards = [
    ["Time to first useful audit", fmt(metrics.meanTimeToFirstUsefulAuditMinutes, " min"), "Target < 15 minutes"],
    ["Time to first recovery action", fmt(metrics.meanTimeToFirstRecoveryActionMinutes, " min"), "Target < 30 minutes"],
    ["Redirect deployment verification", fmt(metrics.redirectDeploymentVerificationPercent, "%"), "Target 100%"],
    ["Evidence completeness", fmt(metrics.evidenceCompletenessPercent, "%"), "Target 100%"],
    ["Estimated gross margin", fmt(metrics.grossMarginEstimatePercent, "%"), `Target 75%+ · ${metrics.grossMarginWarningWorkspaces} workspace warnings`],
    ["Gross revenue retention", fmt(metrics.grrPercent, "%"), "Target 90%+ · renewal cohorts not recorded"],
    ["Net revenue retention", fmt(metrics.nrrPercent, "%"), "Target 100%+ · expansion events not recorded"],
    ["Customer activation", fmt(metrics.activationPercent, "%"), `Target 70%+ · ${metrics.workspaceCount} workspaces`],
  ];
  return <div className="space-y-6">
    <Card className="border-white/10 bg-white/[.03] text-white"><CardHeader><CardTitle>Weekly minimum operating targets · week of {data.weekStart}</CardTitle><p className="text-xs text-slate-400">Update counts as work is completed. The checklist is saved to the founder-only scorecard.</p></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {WEEKLY_OPERATING_TARGETS.map(item => <label key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><span className="block text-xs font-medium text-slate-200">{item.label}</span>{"checkbox" in item ? <span className="mt-3 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={scorecard.weekly_review_complete} onChange={event => setScorecard(current => ({ ...current, weekly_review_complete: event.target.checked }))} />Completed this week</span> : <span className="mt-3 flex items-center gap-3"><input type="number" min={0} max={10000} value={scorecard[item.id as keyof FounderScorecard] as number} onChange={event => setScorecard(current => ({ ...current, [item.id]: Math.max(0, Number(event.target.value) || 0) }))} className="w-24 rounded-lg border border-white/10 bg-[#080b10] px-3 py-2 text-sm" /><span className="text-[11px] text-slate-500">Target {item.target}{"stretchTarget" in item ? `–${item.stretchTarget}` : ""} {item.unit}</span></span>}</label>)}
    </CardContent><div className="px-6 pb-4 text-xs text-slate-500" role="status">{saveState}</div></Card>

    <section><h2 className="mb-3 text-sm font-semibold text-white">Section 10 operating metrics scorecard</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, target]) => <Card key={label} className="border-white/10 bg-white/[.03] text-white"><CardContent className="p-4"><p className="text-[11px] text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{target}</p></CardContent></Card>)}</div><p className="mt-2 text-[10px] leading-5 text-slate-500">{metrics.measurementNote}</p></section>

    <Card className="border-white/10 bg-white/[.03] text-white"><CardHeader><CardTitle>MRR trajectory and segment mix</CardTitle><p className="text-xs text-slate-400">Plan-priced MRR estimate from active Pro and Agency billing variants. Estimated ARR is MRR × 12.</p></CardHeader><CardContent>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-slate-500">Plan-priced estimated MRR</p><p className="mt-2 text-2xl font-semibold">{usd(data.revenue.planPricedEstimatedMrrUsd)}</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-slate-500">Estimated ARR run rate</p><p className="mt-2 text-2xl font-semibold">{usd(data.revenue.planPricedEstimatedArrUsd)}</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-slate-500">Active subscription records</p><p className="mt-2 text-2xl font-semibold">{data.revenue.activeSubscriptionCount}</p><p className="mt-1 text-[10px] text-slate-500">Unpriced plans: {data.revenue.unpricedActiveSubscriptions}</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(data.revenue.segmentMixEstimatedMrrUsd).map(([segment, amount]) => <div key={segment} className="flex items-center justify-between rounded-lg border border-white/[.07] px-3 py-2 text-xs"><span className="capitalize text-slate-400">{segment.replaceAll("_", " ")}</span><strong>{usd(amount)}</strong></div>)}</div>
      <div className="mt-5 space-y-3">{REVENUE_MILESTONES.map(milestone => <div key={milestone.month}><div className="mb-1 flex justify-between gap-3 text-xs"><span>{milestone.label}</span><span className="text-slate-400">{usd(milestone.targetMrrUsd)} MRR</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.min(100, data.revenue.planPricedEstimatedMrrUsd / milestone.targetMrrUsd * 100)}%` }} /></div></div>)}</div>
      <p className="mt-4 text-[10px] leading-5 text-slate-500">{data.revenue.measurementNote}</p>
    </CardContent></Card>
  </div>;
}
