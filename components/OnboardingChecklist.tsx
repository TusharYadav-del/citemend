"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Circle, ArrowRight, ChevronDown } from "lucide-react";

export type OnboardingProgress = {
  domainConnected: boolean;
  firstAudit: boolean;
  recoveryApproved: boolean;
  resultVerified: boolean;
};

const steps = [
  { key: "domainConnected", title: "1. Connect a domain", detail: "A domain is connected when an audit is saved to this workspace.", href: "/#audit", action: "Connect domain" },
  { key: "firstAudit", title: "2. Run first audit (<15m target)", detail: "Review buyer-prompt observations and checked URLs.", href: "#audit-history", action: "View audit" },
  { key: "recoveryApproved", title: "3. Preview & approve first recovery (<30m target)", detail: "Review the destination and explicitly approve it.", href: "#recovery-command", action: "Review recovery" },
  { key: "resultVerified", title: "4. Verify two-stage outcome", detail: "Technical deployment and later AI citation are reported separately.", href: "#overview", action: "View verification" },
] as const;

export default function OnboardingChecklist({ progress }: { progress: OnboardingProgress }) {
  const [expanded, setExpanded] = useState(true);
  const completed = steps.filter((step) => progress[step.key]).length;
  return (
    <section aria-labelledby="onboarding-title" className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-400">GUIDED FIRST AUDIT</p><h2 id="onboarding-title" className="mt-2 text-xl font-semibold text-white">Your first recovery, step by step</h2><p className="mt-1 text-sm text-slate-400">The checklist tracks saved workspace evidence; completing it does not guarantee AI recrawling.</p></div>
        <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls="onboarding-steps" className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-300">{completed}/4 complete <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} /></button>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={4} aria-valuenow={completed}>
        <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-500" style={{ width: `${completed * 25}%` }} />
      </div>
      {expanded && <ol id="onboarding-steps" className="mt-5 grid gap-2 sm:grid-cols-2">
        {steps.map((step) => {
          const done = progress[step.key];
          return <li key={step.key} className={`flex min-w-0 items-start gap-3 rounded-xl border p-3.5 ${done ? "border-emerald-400/20 bg-emerald-400/5" : "border-white/10 bg-black/20"}`}>
            <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-slate-500"}`} aria-label={done ? "Completed" : "Not completed"}>{done ? <Check className="size-4" aria-hidden="true" /> : <Circle className="size-3" aria-hidden="true" />}</span>
            <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold leading-5 text-slate-100">{step.title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{step.detail}</p><Link href={step.href} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:underline">{done ? "View" : step.action}<ArrowRight className="size-3" aria-hidden="true" /></Link></div>
          </li>;
        })}
      </ol>}
    </section>
  );
}
