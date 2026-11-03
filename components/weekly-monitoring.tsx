"use client";

import { useState } from "react";
import UpgradeModal from "@/components/upgrade-modal";

export default function WeeklyMonitoring({ isPro }: { isPro: boolean | null }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-semibold tracking-widest text-emerald-400">PRO FEATURE</p><h2 className="mt-2 text-lg font-semibold text-white">Automated weekly monitoring</h2><p className="mt-2 text-sm leading-6 text-slate-400">When scheduling is active, your eligible domains are scanned each Monday at 9:00 AM Asia/Kolkata.</p></div>
        {isPro === null ? <p role="status" className="text-sm text-slate-400">Subscription status is unavailable. Try again later.</p> : isPro ? <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">Pro eligible</span> : <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-white/5">Unlock with Pro</button>}
      </div>
      {open && <UpgradeModal onClose={() => setOpen(false)} />}
    </section>
  );
}
