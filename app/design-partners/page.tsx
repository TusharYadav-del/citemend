import type { Metadata } from "next";
import Link from "next/link";
import { DesignPartnerApplicationForm } from "@/components/design-partner-application-form";

export const metadata: Metadata = {
  title: "Design Partner Program | CiteMend",
  description: "Apply for founder-led CiteMend onboarding for SEO/GEO agencies and B2B SaaS teams.",
};

const tracks = [
  { number: "01", title: "SEO / GEO Agencies", audience: "Managing 5–50 clients", description: "Turn client buyer prompts into scoped citation evidence, broken-destination checks, and reviewable recovery recommendations." },
  { number: "02", title: "B2B SaaS Companies", audience: "Content libraries + buyer-intent prompts", description: "Inspect whether public product, pricing, and documentation pages are discoverable and represented in a modeled search answer." },
];

export default function DesignPartnersPage() {
  return <main className="min-h-screen bg-[#07090E] px-5 py-10 text-[#F5F7FA] sm:px-8 sm:py-16">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="text-xs font-semibold tracking-wide text-emerald-200 hover:text-white">CITEMEND <span className="text-slate-500">/ DESIGN PARTNERS</span></Link>
      <div className="mt-10 grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#39D9FF]">Sprint 8 · guided onboarding</p><h1 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">Design Partner Program</h1><p className="mt-4 text-sm leading-7 text-slate-400">We’re onboarding teams who need clearer evidence about where AI search answers point and what can be safely recovered.</p><div className="mt-7 space-y-3">{tracks.map((track) => <article key={track.number} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">{track.title}</h2><span className="font-mono text-[10px] text-slate-500">{track.number}</span></div><p className="mt-1 text-xs font-medium text-emerald-100">{track.audience}</p><p className="mt-2 text-xs leading-5 text-slate-400">{track.description}</p></article>)}</div><p className="mt-4 text-xs leading-5 text-slate-500">Ecommerce teams can also apply. Applications are reviewed; submission does not activate a subscription or guarantee paid beta access.</p><Link href="/forensic-scan" className="mt-5 inline-flex text-xs font-semibold text-emerald-200 underline decoration-emerald-200/40 underline-offset-4">Try the public scan first</Link></div>
        <div><div className="mb-4"><h2 className="text-lg font-semibold text-white">Apply for onboarding</h2><p className="mt-1 text-xs leading-5 text-slate-400">Your submission automatically runs a rate-limited forensic teaser for the website and buyer prompt you provide.</p></div><DesignPartnerApplicationForm /></div>
      </div>
    </div>
  </main>;
}
