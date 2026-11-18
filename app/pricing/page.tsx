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
  { name: "Recovery Pilot", tier: "pilot" as const, price: "$149 once", description: "A one-time 30-day recovery engagement for one domain workspace." },
  { name: "Growth", tier: "growth" as const, price: "$99/month", description: "Recurring recovery monitoring for a commerce team." },
  { name: "Agency", tier: "agency" as const, price: "$249/month", description: "Multi-client recovery workflows and client-ready reports." },
];

export default function PricingPage() {
  const clerkReady = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) && isBillingEnabled();
  const available = { pilot: !!process.env.DODO_PRODUCT_PILOT_ID, growth: !!process.env.DODO_PRODUCT_GROWTH_ID, agency: !!process.env.DODO_PRODUCT_AGENCY_ID };
  return <><main className="min-h-screen bg-[#05070b] px-5 py-16 text-white sm:px-8"><div className="mx-auto max-w-6xl"><Link href="/" className="text-sm text-emerald-300">← CiteMend</Link><h1 className="mt-8 text-4xl font-semibold">Pricing</h1><p className="mt-3 max-w-2xl text-sm text-slate-400">Choose a one-time recovery pilot or recurring Growth and Agency plans. Dodo Payments displays billing terms before purchase.</p>
    <div className="mt-8 grid gap-4 md:grid-cols-3">{offers.map(offer => <article key={offer.name} className="flex min-h-64 flex-col rounded-xl border border-white/10 bg-white/[.03] p-5"><h2 className="text-xl font-semibold">{offer.name}</h2><p className="mt-2 text-2xl font-semibold text-emerald-200">{offer.price}</p><p className="mt-3 flex-1 text-sm leading-6 text-slate-400">{offer.description}</p><div className="mt-6">{clerkReady && available[offer.tier] ? <BillingCheckoutButton tier={offer.tier} label={offer.tier === "pilot" ? "Start the Pilot" : `Subscribe to ${offer.name}`} /> : <Link href="/support?category=billing_question" className="text-sm text-emerald-300 underline">Ask about availability</Link>}</div></article>)}</div></div></main><SiteFooter /></>;
}
