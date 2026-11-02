"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

const steps = [
  "Fetching sitemap.xml...",
  "Probing Groq & Tavily search grounding across 5 buyer intents...",
  "Verifying HTTP status codes on cited links...",
  "Computing semantic pgvector redirect matches...",
];

export default function AuditProgress({ promptCount }: { promptCount: number }) {
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      setStep(Math.floor(seconds / 4) % steps.length);
    }, 500);
    return () => window.clearInterval(timer);
  }, []);
  const progress = Math.min(92, 12 + elapsed * 2.5);
  const current = steps[step].replace("5 buyer intents", `${promptCount} buyer intent${promptCount === 1 ? "" : "s"}`);
  return <div className="mt-7 rounded-xl border border-[#dce6d1] bg-[#f0f5e9] p-5" role="status" aria-live="polite" aria-label={`Audit in progress: ${current}`}>
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-[#294b34]">Running {promptCount} buyer prompt{promptCount === 1 ? "" : "s"} in parallel</p><span className="text-xs tabular-nums text-[#6c7965]">{Math.round(progress)}%</span></div>
    <Progress value={progress} className="mt-3" aria-label="Audit progress" />
    <p className="mt-3 min-h-5 text-xs text-[#6c7965]">{current}</p>
    <div className="mt-3 flex gap-1.5" aria-hidden="true">{steps.map((item, index) => <span key={item} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${index === step ? "bg-[#78a35c]" : "bg-[#d9e3d2]"}`} />)}</div>
  </div>;
}
