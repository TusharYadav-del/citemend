"use client";
import { useEffect, useRef } from "react";

export default function PrintReportButton({ autoPrint = false }: { autoPrint?: boolean }) {
  const printed = useRef(false);
  useEffect(() => {
    if (!autoPrint || printed.current) return;
    printed.current = true;
    void Promise.all([document.fonts.ready, ...Array.from(document.images).filter(image => !image.complete).map(image => new Promise<void>(resolve => { image.addEventListener("load", () => resolve(), { once: true }); image.addEventListener("error", () => resolve(), { once: true }); window.setTimeout(resolve, 3000); }))]).then(() => window.print());
  }, [autoPrint]);
  return <button type="button" onClick={() => window.print()} className="print-hide rounded-lg border border-emerald-400/30 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-400/10">Export Report / Save as PDF</button>;
}
