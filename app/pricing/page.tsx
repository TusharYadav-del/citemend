import Link from "next/link";
import { BillingCheckoutButton } from "@/components/billing-checkout-button";
import { SiteFooter } from "@/components/site-footer";
import { isBillingEnabled } from "@/lib/billing-checkout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing | CiteMend",
  description: "Choose a $149 one-time recovery pilot, $99 monthly Growth, or $249 monthly Agency plan.",
  openGraph: { type: "website", title: "CiteMend Pricing", description: "$149 recovery pilot, $99/month Growth, and $249/month Agency." },
};

const offers = [
  { name: "Pilot", tier: "pilot" as const, price: "$149 one-time", description: "A 30-day paid recovery pilot for one commerce workspace." },
  { name: "Growth", tier: "growth" as const, price: "$99/month", description: "Recurring recovery monitoring for a commerce team." },
  { name: "Agency", tier: "agency" as const, price: "$249/month", description: "Multi-client recovery workflows and client-ready reports." },
];

export default function PricingPage() {
  const billingReady = isBillingEnabled();
  return <><main className="min-h-screen bg-[#05070b] px-5 py-16 text-white sm:px-8"><div className="mx-auto max-w-6xl"><Link href="/" className="text-sm text-emerald-300">← CiteMend</Link><h1 className="mt-8 text-4xl font-semibold">Pricing</h1><p className="mt-3 max-w-2xl text-sm text-slate-400">Choose a one-time recovery pilot or recurring Growth and Agency plans. Dodo Payments displays billing terms before purchase.</p>
    {!billingReady && <p role="status" className="mt-6 rounded-lg border border-amber-300/20 bg-amber-300/[.05] p-4 text-sm text-amber-100">Paid checkout is temporarily unavailable. Please try again later.</p>}
    <div className="mt-8 grid gap-4 md:grid-cols-3">{offers.map(offer => <article key={offer.name} className="flex min-h-64 flex-col rounded-xl border border-white/10 bg-white/[.03] p-5"><h2 className="text-xl font-semibold">{offer.name}</h2><p className="mt-2 text-2xl font-semibold text-emerald-200">{offer.price}</p><p className="mt-3 flex-1 text-sm leading-6 text-slate-400">{offer.description}</p><div className="mt-6"><BillingCheckoutButton tier={offer.tier} label={offer.tier === "pilot" ? "Start the Pilot" : `Choose ${offer.name}`} /></div></article>)}</div></div></main><SiteFooter /></>;
}
