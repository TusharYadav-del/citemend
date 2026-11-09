import Link from "next/link";
import { BillingCheckoutButton } from "@/components/billing-checkout-button";
import { SiteFooter } from "@/components/site-footer";
import { isBillingEnabled } from "@/lib/lemonsqueezy";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing | CiteMend",
  description: "Start with a 30-day paid recovery pilot or choose recurring monitoring for an SEO agency or website team.",
  openGraph: { type: "website", title: "CiteMend Pricing", description: "A paid recovery pilot and recurring monthly or agency monitoring." },
};

const offers = [
  { name: "Free", tier: null, price: "$0", description: "Start with a free citation diagnostic." },
  { name: "Starter", tier: "starter" as const, price: "$49/month", description: "One domain workspace for focused recovery and recurring monthly monitoring." },
  { name: "Agency", tier: "agency" as const, price: "$249/month", description: "Multi-client recovery workflows, recurring monitoring, and client-ready reports." },
];

export default function PricingPage() {
  const clerkReady = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) && isBillingEnabled();
  const available = { starter: !!process.env.LEMONSQUEEZY_STARTER_VARIANT_ID, agency: !!process.env.LEMONSQUEEZY_AGENCY_VARIANT_ID };
  return <><main className="min-h-screen bg-[#05070b] px-5 py-16 text-white sm:px-8"><div className="mx-auto max-w-6xl"><Link href="/" className="text-sm text-emerald-300">← CiteMend</Link><h1 className="mt-8 text-4xl font-semibold">Pricing</h1><p className="mt-3 max-w-2xl text-sm text-slate-400">Choose a one-month paid recovery pilot or recurring monitoring. Checkout displays billing terms before purchase.</p>
    <section className="mt-8 rounded-2xl border border-emerald-300/20 bg-emerald-300/[.04] p-6"><p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">30-Day Paid Recovery Pilot / Audit</p><h2 className="mt-2 text-2xl font-semibold">Start with one month of verified recovery work.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">$49 for the first month through Starter checkout, then $49/month unless cancelled. Includes one domain workspace, verified URL checks, human-approved redirect review, and a recovery value summary.</p><div className="mt-5">{clerkReady && available.starter ? <BillingCheckoutButton tier="starter" label="Start 30-Day Paid Pilot" /> : <Link href="/support?category=billing_question" className="inline-flex rounded-lg border border-white/20 px-4 py-2 text-sm">Ask about the paid pilot</Link>}</div></section>
    <div className="mt-10 grid gap-4 md:grid-cols-3">{offers.map(offer => <article key={offer.name} className="flex min-h-64 flex-col rounded-xl border border-white/10 bg-white/[.03] p-5"><h2 className="text-xl font-semibold">{offer.name}</h2><p className="mt-2 text-2xl font-semibold text-emerald-200">{offer.price}</p><p className="mt-3 flex-1 text-sm leading-6 text-slate-400">{offer.description}</p><div className="mt-6">{!offer.tier ? <Link href="/forensic-scan" className="inline-flex rounded-lg border border-white/20 px-4 py-2 text-sm">Run free scan</Link> : clerkReady && available[offer.tier] ? <BillingCheckoutButton tier={offer.tier} label={`Subscribe to ${offer.name}`} /> : <Link href="/support" className="text-sm text-emerald-300 underline">Ask about availability</Link>}</div></article>)}</div></div></main><SiteFooter /></>;
}
