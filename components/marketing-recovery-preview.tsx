"use client";

import { useState } from "react";
import { ArrowRight, Check, FileSearch, Link2, ShieldCheck } from "lucide-react";

const scenarios = [
  {
    id: "broken", label: "Broken citation", short: "Broken citation",
    before: "The guide is at example.com/guides/old-route.",
    after: "The current guide is at example.com/guides/new-route.",
    source: "/guides/old-route", destination: "/guides/new-route",
    finding: "The cited path returns 404 in this sample workflow.",
    action: "A same-host 301 can be proposed after source and destination checks.",
  },
  {
    id: "competitor", label: "Broken-Source Outreach", short: "Replacement Content Opportunities",
    before: "A category answer cites a competitor page that no longer resolves.",
    after: "A publisher may update its source to a relevant, live page after outreach.",
    source: "competitor.example/retired-guide", destination: "example.com/category-guide",
    finding: "A dead third-party citation is an outreach opportunity.",
    action: "Prepare a verified replacement and request a publisher update. CiteMend cannot redirect a competitor domain.",
  },
  {
    id: "pricing", label: "Fix stale AI pricing claim", short: "Pricing conflict",
    before: "The answer quotes an outdated plan price.",
    after: "A later observation may reflect the current public pricing page.",
    source: "example.com/pricing", destination: "example.com/pricing",
    finding: "The saved answer conflicts with the public price in this sample.",
    action: "Correct schema and page facts, then run another observation. A 301 is not appropriate for a live pricing page.",
  },
] as const;

export function MarketingRecoveryPreview({ embedded = false }: { embedded?: boolean }) {
  const [selected, setSelected] = useState<(typeof scenarios)[number]["id"]>("broken");
  const scenario = scenarios.find(item => item.id === selected)!;

  return (
    <div className={embedded ? "min-w-0" : "cm-container pb-8 sm:pb-12"} role="region" aria-label="Interactive Recovery Center preview">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md border border-accent/25 bg-accent/10 text-accent"><ShieldCheck aria-hidden="true" className="size-4" /></span>
            <span className="text-sm font-semibold text-foreground">Recovery Center <span className="font-normal text-text-tertiary">/ Citation forensics</span></span>
          </div>
          <span className="rounded-md border border-warning/30 bg-warning/5 px-2.5 py-1.5 font-mono text-[10px] font-medium tracking-wide text-warning">INTERACTIVE SAMPLE · NO LIVE CHECK</span>
        </div>

        <div role="tablist" aria-label="Preview scenarios" className="flex gap-1 overflow-x-auto border-b border-border p-2">
          {scenarios.map((item, index) => <button
            key={item.id} type="button" role="tab" id={`preview-tab-${item.id}`}
            aria-selected={selected === item.id} aria-controls="preview-panel" tabIndex={selected === item.id ? 0 : -1}
            onClick={() => setSelected(item.id)}
            onKeyDown={event => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const next = (index + (event.key === "ArrowRight" ? 1 : -1) + scenarios.length) % scenarios.length;
              setSelected(scenarios[next].id);
              const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
              tabs?.[next]?.focus();
            }}
            className={`min-h-10 min-w-max rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${selected === item.id ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-surface-soft hover:text-foreground"}`}
          >{item.label}</button>)}
        </div>

        <div id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${selected}`} className="grid grid-cols-12 gap-px bg-border">
          <div className="col-span-12 min-w-0 bg-surface-raised p-4 sm:p-5 lg:col-span-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[.12em] text-accent">Before / after answer diff</p>
              <span className="break-words font-mono text-[10px] text-text-tertiary">{scenario.short}</span>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-md border border-danger/25 bg-danger/5 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-danger">Before · sample claim</p><p className="mt-3 break-words text-sm leading-6 text-foreground">{scenario.before}</p></div>
              <div className="min-w-0 rounded-md border border-success/25 bg-success/5 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-success">After · intended outcome</p><p className="mt-3 break-words text-sm leading-6 text-foreground">{scenario.after}</p></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-text-tertiary">An actual after answer is shown only after a later observation. This sample does not represent measured customer evidence.</p>
          </div>

          <div className="col-span-12 min-w-0 bg-surface p-4 sm:p-5 lg:col-span-4">
            <p className="font-mono text-[10px] uppercase tracking-[.12em] text-accent">Inspector</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-border p-3"><p className="flex items-center gap-2 text-sm font-semibold text-foreground"><FileSearch aria-hidden="true" className="size-4 text-danger" />Detected problem</p><p className="mt-2 text-xs leading-5 text-text-secondary">{scenario.finding}</p></div>
              <div className="rounded-md border border-border p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><Link2 aria-hidden="true" className="size-4 text-accent" />Recovery action</p>
                <p className="mt-2 text-xs leading-5 text-text-secondary">{scenario.action}</p>
                {scenario.id === "broken" && <div className="mt-3 min-w-0 rounded-md border border-accent/25 bg-accent/5 p-2 font-mono text-[11px] text-foreground"><p className="break-all">301 {scenario.source}</p><p className="mt-1 break-all">→ {scenario.destination}</p><p className="mt-2 flex items-center gap-1.5 font-sans text-xs text-warning"><Check aria-hidden="true" className="size-3.5" />Preview rule · live verification required</p></div>}
              </div>
            </div>
            <a href="/forensic-scan" className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">Check your own domain <ArrowRight aria-hidden="true" className="size-4" /></a>
          </div>
        </div>
      </div>
    </div>
  );
}
