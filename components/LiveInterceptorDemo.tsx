"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Check, CircleAlert, Clock3, RotateCw, ShieldCheck, Sparkles } from "lucide-react";

type DemoState = "ready" | "matching" | "recovered" | "dead";

export default function LiveInterceptorDemo() {
  const [enabled, setEnabled] = useState(true);
  const [state, setState] = useState<DemoState>("ready");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function playDemo(useCiteFix = enabled) {
    if (timer.current) clearTimeout(timer.current);
    setState(useCiteFix ? "matching" : "dead");
    if (useCiteFix) timer.current = setTimeout(() => setState("recovered"), 850);
  }

  function changeMode(next: boolean) {
    setEnabled(next);
    playDemo(next);
  }

  const status = state === "matching"
    ? { label: "Matching a live destination…", color: "text-amber-700", icon: <RotateCw className="size-4 animate-spin" /> }
    : state === "recovered"
      ? { label: "Recovered · visitor reaches pricing", color: "text-emerald-700", icon: <Check className="size-4" /> }
      : state === "dead"
        ? { label: "404 · visitor hits a dead end", color: "text-rose-700", icon: <CircleAlert className="size-4" /> }
        : { label: "Click the link to try the demo", color: "text-slate-500", icon: <ArrowDown className="size-4" /> };

  return <section aria-labelledby="demo-heading" className="bg-[#f6f8f3] px-5 py-16 sm:px-8 sm:py-22">
    <div className="mx-auto max-w-7xl">
      <div className="mx-auto max-w-3xl text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#dce8d4] bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.15em] text-[#517346]"><Sparkles className="size-3.5" /> Try the live sandbox</p>
        <h2 id="demo-heading" className="mt-4 text-3xl font-semibold tracking-[-.045em] text-[#173126] sm:text-5xl">See a lost AI referral find its way.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#65756a] sm:text-base">A clickable, simulated journey shows how a broken recommendation can reach a live page when recovery is enabled.</p>
      </div>

      <div className="mt-9 grid overflow-hidden rounded-[1.75rem] border border-[#dce5d6] bg-white shadow-[0_24px_80px_-48px_#193c2a] lg:grid-cols-[1fr_1fr]">
        <div className="bg-[#f3f5f2] p-5 sm:p-8">
          <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#748276]">Buyer prompt</p><p className="mt-1 text-sm font-semibold text-[#27392e]">“What enterprise plans does Acme offer?”</p></div><span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-[#69766c] shadow-sm">ChatGPT preview</span></div>
          <div className="rounded-2xl border border-[#e2e7e1] bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#35463b]"><span className="grid size-6 place-items-center rounded-full bg-[#e9f2e4] text-[#4d7548]">AI</span> Assistant</div>
            <p className="mt-4 text-sm leading-7 text-[#455349]">Acme offers flexible plans for growing teams. For advanced controls and volume pricing, explore its enterprise package:</p>
            <a href="#demo-result" onClick={(event) => { event.preventDefault(); playDemo(); }} className="mt-3 inline-flex items-center gap-1 rounded-md bg-[#f0f5ea] px-2 py-1 text-sm font-semibold text-[#285a38] underline decoration-[#98b47d] underline-offset-4 hover:bg-[#e6f0dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#49754d]">acme.io/enterprise-2024-rates <ArrowUpRight className="size-3.5" /></a>
            <p className="mt-4 text-xs leading-5 text-[#7a867c]">Try clicking the broken link, or switch recovery on the right.</p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#8a958b]"><ShieldCheck className="size-4 text-[#6f9560]" /> Safe sandbox · no external request is made</div>
        </div>

        <div className="p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#748276]">Visitor experience</p>
          <div className="mt-4 rounded-2xl border border-[#e3e9e0] bg-[#fbfcfa] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-semibold text-[#26372c]">{enabled ? "With CiteFix Pixel ✅" : "Without CiteFix ❌"}</p><p className="mt-1 text-xs text-[#78847a]">{enabled ? "180ms Semantic 301 Recovery + Slack Alert" : "Dead 404 Bounce"}</p></div>
              <button type="button" role="switch" aria-checked={enabled} aria-label="Enable CiteFix recovery" onClick={() => changeMode(!enabled)} className={`relative inline-flex h-8 w-[3.65rem] shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#426d48] ${enabled ? "bg-[#377148]" : "bg-[#a9b1aa]"}`}><span className={`size-6 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-[1.65rem]" : "translate-x-0"}`} /></button>
            </div>
            <p className={`mt-4 flex min-h-6 items-center gap-2 text-sm font-semibold ${status.color}`} role="status" aria-live="polite">{status.icon}{status.label}</p>
            <div id="demo-result" className={`mt-3 rounded-xl border p-4 transition-all duration-500 ${state === "recovered" ? "border-emerald-200 bg-emerald-50" : state === "dead" ? "border-rose-200 bg-rose-50" : state === "matching" ? "border-amber-200 bg-amber-50" : "border-[#e5eae3] bg-white"}`}>
              {state === "recovered" ? <><p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><Check className="size-4" /> Landed on the right page</p><p className="mt-2 break-all font-mono text-xs text-emerald-800">https://acme.io/pricing</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-emerald-200 pt-3 text-[11px] font-medium text-emerald-800"><span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5" /> pgvector cosine similarity: 0.94</span><span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" /> 180ms semantic recovery</span></div><p className="mt-2 text-[11px] text-emerald-700">Slack alert queued · simulated</p></>
                : state === "dead" ? <><p className="flex items-center gap-2 text-sm font-semibold text-rose-900"><CircleAlert className="size-4" /> Page not found</p><p className="mt-2 break-all font-mono text-xs text-rose-800">acme.io/enterprise-2024-rates returned 404</p><p className="mt-3 text-[11px] text-rose-700">Without recovery, the visitor leaves without reaching Acme pricing.</p></>
                  : state === "matching" ? <><p className="flex items-center gap-2 text-sm font-semibold text-amber-900"><RotateCw className="size-4 animate-spin" /> Comparing page meaning to live URLs</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100"><div className="h-full w-2/3 animate-pulse rounded-full bg-amber-500" /></div><p className="mt-2 text-xs text-amber-800">pgvector cosine similarity: calculating…</p></>
                    : <><p className="text-sm font-semibold text-[#304236]">Broken destination</p><p className="mt-2 break-all font-mono text-xs text-[#68756a]">acme.io/enterprise-2024-rates</p><p className="mt-3 text-[11px] text-[#818b82]">Choose a mode or click the link to watch the simulated result.</p></>}
            </div>
          </div>
          <p className="mt-4 text-[11px] leading-5 text-[#849087]">Illustrative demo only. The 180ms and 0.94 values are sample UI and are not a live measurement.</p>
        </div>
      </div>
    </div>
  </section>;
}
