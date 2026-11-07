"use client";

import { useState } from "react";
import { ArrowRight, Check, FileSearch, Link2, ShieldCheck } from "lucide-react";

const scenarios = [
  {
    id: "broken", label: "Catch & redirect hallucinated 404", short: "Broken citation",
    before: "The guide is at example.com/guides/old-route.",
    after: "The current guide is at example.com/guides/new-route.",
    source: "/guides/old-route", destination: "/guides/new-route",
    finding: "The cited path returns 404 in this sample workflow.",
    action: "A same-host 301 can be proposed after source and destination checks.",
  },
  {
    id: "competitor", label: "Hijack dead competitor citation", short: "Competitor source",
    before: "A category answer cites a competitor page that no longer resolves.",
    after: "A publisher may update its source to a relevant, live page after outreach.",
    source: "competitor.example/retired-guide", destination: "example.com/category-guide",
    finding: "A dead third-party citation is an outreach opportunity.",
    action: "Prepare a verified replacement and request a publisher update. CiteMend cannot redirect a competitor domain.",
  },
  {
    id: "pricing", label: "Fix stale AI pricing claim", short: "Pricing conflict",
    before: "The answer quotes an outdated plan price.",
    after: "The next observed answer may reflect the current public pricing page.",
    source: "example.com/pricing", destination: "example.com/pricing",
    finding: "The saved answer conflicts with the public price in this sample.",
    action: "Correct schema and page facts, then run another observation. A 301 is not appropriate for a live pricing page.",
  },
] as const;

export function MarketingRecoveryPreview({ embedded = false }: { embedded?: boolean }) {
  const [selected, setSelected] = useState<(typeof scenarios)[number]["id"]>("broken");
  const scenario = scenarios.find(item => item.id === selected)!;
  return <div className={embedded ? "min-w-0" : "cm-container pb-8 sm:pb-12"} role="region" aria-label="Interactive Recovery Center preview">
    <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#0D1119] shadow-[0_28px_80px_-40px_#000]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.08] px-4 py-3 sm:px-5"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-emerald-300/10 text-emerald-300"><ShieldCheck className="size-4" /></span><span className="text-xs font-semibold text-white">Recovery Center · Citation forensics</span></div><span className="rounded-md border border-amber-300/20 px-2 py-1 font-mono text-[10px] text-amber-200">INTERACTIVE SAMPLE · NO LIVE CHECK</span></div>
      <div role="tablist" aria-label="Preview scenarios" className="flex gap-1 overflow-x-auto border-b border-white/[.08] p-2">{scenarios.map((item, index) => <button key={item.id} type="button" role="tab" id={`preview-tab-${item.id}`} aria-selected={selected === item.id} aria-controls="preview-panel" tabIndex={selected === item.id ? 0 : -1} onClick={() => setSelected(item.id)} onKeyDown={event => { if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return; event.preventDefault(); const next = (index + (event.key === "ArrowRight" ? 1 : -1) + scenarios.length) % scenarios.length; setSelected(scenarios[next].id); const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]'); tabs?.[next]?.focus(); }} className={`min-w-max rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-emerald-300 ${selected === item.id ? "bg-emerald-300/10 text-emerald-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{item.label}</button>)}</div>
      <div id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${selected}`} className="grid grid-cols-12 gap-px bg-white/[.08]">
        <div className="col-span-12 bg-[#101722] p-4 sm:p-5 lg:col-span-8"><div className="mb-4 flex items-center justify-between gap-3"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-cyan-200">Before / after answer diff</p><span className="font-mono text-[10px] text-slate-500">{scenario.short}</span></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-rose-300/20 bg-rose-300/[.04] p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-rose-200">Before · sample claim</p><p className="mt-3 text-sm leading-6 text-slate-200">{scenario.before}</p></div><div className="rounded-lg border border-emerald-300/20 bg-emerald-300/[.04] p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200">After · intended outcome</p><p className="mt-3 text-sm leading-6 text-slate-200">{scenario.after}</p></div></div><p className="mt-4 text-[11px] leading-5 text-slate-500">An actual after answer is shown only after a later observation. This sample does not represent measured customer evidence.</p></div>
        <div className="col-span-12 bg-[#0D1119] p-4 sm:p-5 lg:col-span-4"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-emerald-300">Inspector</p><div className="mt-4 space-y-3"><div className="rounded-lg border border-white/[.08] p-3"><p className="flex items-center gap-2 text-xs font-semibold text-white"><FileSearch className="size-3.5 text-rose-300" />Detected problem</p><p className="mt-2 text-xs leading-5 text-slate-400">{scenario.finding}</p></div><div className="rounded-lg border border-white/[.08] p-3"><p className="flex items-center gap-2 text-xs font-semibold text-white"><Link2 className="size-3.5 text-emerald-300" />Recovery action</p><p className="mt-2 text-xs leading-5 text-slate-400">{scenario.action}</p>{scenario.id === "broken" && <div className="mt-3 rounded-md border border-emerald-300/15 bg-emerald-300/[.04] p-2 font-mono text-[10px] text-emerald-100"><p>301 {scenario.source}</p><p className="mt-1 break-all">→ {scenario.destination}</p><p className="mt-2 flex items-center gap-1 text-amber-200"><Check className="size-3" />Preview rule · live verification required</p></div>}</div></div><a href="/forensic-scan" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:underline">Check your own domain <ArrowRight className="size-3.5" /></a></div>
      </div>
    </div>
  </div>;
}
