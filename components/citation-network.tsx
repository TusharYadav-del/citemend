"use client";

import { useState, type CSSProperties, type PointerEvent } from "react";
import { Bot, CircleDot, Globe2, Link2, Sparkles } from "lucide-react";

const engines = [
  { label: "ChatGPT Search", x: 2, y: 23, color: "#37f5a0", icon: Bot },
  { label: "Perplexity", x: 2, y: 50, color: "#39d9ff", icon: Sparkles },
  { label: "Gemini", x: 2, y: 77, color: "#a99cff", icon: CircleDot },
];
const pages = [
  { label: "/pricing", x: 64, y: 29 },
  { label: "/guides/compare", x: 64, y: 68 },
];
const links = [["8,23", "64,29"], ["8,23", "64,68"], ["8,50", "64,29"], ["8,50", "64,68"], ["8,77", "64,68"]];

export default function CitationNetwork() {
  const [point, setPoint] = useState({ x: 50, y: 50 });
  function track(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setPoint({ x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 });
  }
  return <div onPointerMove={track} className="cm-network relative isolate min-h-[22rem] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0b1017] p-5 sm:min-h-[26rem] sm:p-7" style={{ "--pointer-x": `${point.x}%`, "--pointer-y": `${point.y}%` } as CSSProperties}>
    <div className="cm-network-spotlight pointer-events-none absolute inset-0 -z-10" />
    <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold text-white">Citation pathways</p><p className="mt-1 text-[11px] text-slate-500">A visual model of engine answers and canonical pages</p></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] font-medium uppercase tracking-wider text-slate-400">Illustrative</span></div>
    <div className="relative mt-5 h-[16rem] sm:h-[19rem]" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <defs><linearGradient id="cm-edge" x1="0" x2="1"><stop stopColor="#39d9ff" stopOpacity=".24" /><stop offset="1" stopColor="#37f5a0" stopOpacity=".75" /></linearGradient></defs>
        {links.map(([from, to], index) => { const [x1, y1] = from.split(",").map(Number); const [x2, y2] = to.split(",").map(Number); return <path key={index} d={`M ${x1} ${y1} C 36 ${y1}, 48 ${y2}, ${x2} ${y2}`} fill="none" stroke="url(#cm-edge)" strokeWidth=".32" className="cm-network-flow" />; })}
        <path d="M 8 23 C 30 20 35 50 51 50 S 59 29 64 29 M 8 77 C 30 81 35 50 51 50" fill="none" stroke="#37f5a0" strokeOpacity=".4" strokeWidth=".55" />
      </svg>
      {engines.map(({ label, x, y, color, icon: Icon }) => <div key={label} className="absolute -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#121a24]/95 px-2.5 py-2 shadow-xl sm:gap-2.5 sm:px-3.5"><span className="grid size-7 place-items-center rounded-lg" style={{ color, backgroundColor: `${color}15` }}><Icon className="size-4" /></span><span className="whitespace-nowrap text-[10px] font-medium text-slate-200 sm:text-xs">{label}</span></div></div>)}
      <div className="absolute left-[51%] top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-emerald-300/30 bg-[#102b20] text-emerald-300 shadow-[0_0_32px_#37f5a02a]"><Link2 className="size-4" /></div>
      {pages.map(({ label, x, y }) => <div key={label} className="absolute -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}><div className="flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-[#102018]/95 px-2.5 py-2 shadow-xl sm:px-3.5"><Globe2 className="size-3.5 shrink-0 text-emerald-300" /><code className="whitespace-nowrap text-[9px] text-emerald-100 sm:text-[11px]">{label}</code></div></div>)}
    </div>
    <p className="text-[10px] leading-5 text-slate-500">Example only. CiteMend reports actual results from each configured audit and does not claim this diagram represents live traffic.</p>
  </div>;
}
