import type { Metadata } from "next";
import Link from "next/link";
import { ForensicScanForm } from "@/components/forensic-scan-form";

export const metadata: Metadata = {
  title: "Free AI Citation Forensic Scan | CiteMend",
  description: "Check public discoverability, page freshness, structured data, and answer URL evidence for one buyer prompt.",
};

export default function ForensicScanPage() {
  return <main className="min-h-screen bg-[#07090E] px-5 py-10 text-[#F5F7FA] sm:px-8 sm:py-16">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="text-xs font-semibold tracking-wide text-emerald-200 hover:text-white">CITEMEND <span className="text-slate-500">/ FREE FORENSIC SCAN</span></Link>
      <div className="mt-10 max-w-3xl"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#39D9FF]">One prompt · public evidence · no account required</p><h1 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Free AI Citation Forensic Scan</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">Enter your domain and one buyer question. Get a quick view of public-page signals and whether one modeled answer returned a URL on your domain.</p></div>
      <section className="mt-8" aria-label="Free forensic scan"><ForensicScanForm /></section>
      <p className="mt-6 max-w-4xl text-[11px] leading-5 text-slate-600">The scan only fetches public HTTP(S) pages using DNS-pinned SSRF controls. A single modeled answer is not a representative measurement of all AI search engines. We cannot inspect private model reasoning.</p>
    </div>
  </main>;
}
