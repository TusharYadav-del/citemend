import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ForensicScanForm } from "@/components/forensic-scan-form";
import { AgencyReferralVisitTracker } from "@/components/agency-referral-visit-tracker";
import { normalizeAgencyReferralCode } from "@/lib/referral-code";

export const metadata: Metadata = {
  title: "Free AI Citation Forensic Scan | CiteMend",
  description: "Check public discoverability, page freshness, structured data, and answer URL evidence for one buyer prompt.",
};

async function ForensicScanContent({ searchParams }: { searchParams: Promise<{ ref?: string | string[]; domain?: string | string[]; agency?: string | string[] }> }) {
  const params = await searchParams;
  const referralCode = normalizeAgencyReferralCode(Array.isArray(params.ref) ? params.ref[0] : params.ref) ?? undefined;
  const initialDomain = Array.isArray(params.domain) ? params.domain[0] : params.domain;
  const agencyName = Array.isArray(params.agency) ? params.agency[0] : params.agency;
  return <main className="min-h-screen bg-[#07090E] px-5 py-10 text-[#F5F7FA] sm:px-8 sm:py-16">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="text-xs font-semibold tracking-wide text-emerald-200 hover:text-white">CITEMEND <span className="text-slate-500">/ FREE FORENSIC SCAN</span></Link>
      <div className="mt-10 max-w-3xl"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#39D9FF]">One prompt · public evidence · no account required</p><h1 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Free AI Citation Forensic Scan</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">Enter your domain and one buyer question. Get a quick view of public-page signals and whether one modeled answer returned a URL on your domain.</p></div>
      <section className="mt-8" aria-label="Free forensic scan"><ForensicScanForm initialDomain={initialDomain} agencyName={agencyName} /></section>
      {referralCode && <AgencyReferralVisitTracker code={referralCode} />}
      <p className="mt-6 max-w-4xl text-[11px] leading-5 text-slate-600">The scan only fetches public HTTP(S) pages using DNS-pinned SSRF controls. A single modeled answer is not a representative measurement of all AI search engines. We cannot inspect private model reasoning.</p>
    </div>
  </main>;
}

export default function ForensicScanPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[]; domain?: string | string[]; agency?: string | string[] }> }) {
  return <Suspense fallback={<main className="min-h-screen bg-[#07090E] px-5 py-10 text-[#F5F7FA] sm:px-8 sm:py-16"><div className="mx-auto max-w-6xl"><div className="h-8 w-56 animate-pulse rounded bg-white/10" /><div className="mt-10 h-96 animate-pulse rounded-2xl bg-white/[.04]" /><span className="sr-only">Loading free forensic scan…</span></div></main>}><ForensicScanContent searchParams={searchParams} /></Suspense>;
}
