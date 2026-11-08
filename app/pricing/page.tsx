import Link from "next/link";
import { BillingCheckoutButton } from "@/components/billing-checkout-button";
import { SiteFooter } from "@/components/site-footer";
import { isBillingEnabled } from "@/lib/lemonsqueezy";

const offers = [
  { name: "Free", tier: null, description: "Start with a free citation diagnostic." },
  { name: "Starter", tier: "starter" as const, description: "A paid workspace for focused recovery work." },
  { name: "Growth", tier: "growth" as const, description: "More scans and prompts for growing teams." },
  { name: "Agency", tier: "agency" as const, description: "Multi-client recovery workflows and reporting." },
];

export default function PricingPage() {
  const clerkReady = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) && isBillingEnabled();
  const available = {
    starter: !!(process.env.LEMONSQUEEZY_STARTER_VARIANT_ID || process.env.LEMONSQUEEZY_VARIANT_ID || process.env.LEMON_SQUEEZY_VARIANT_ID),
    growth: !!process.env.LEMONSQUEEZY_GROWTH_VARIANT_ID,
    agency: !!(process.env.LEMONSQUEEZY_AGENCY_VARIANT_ID || process.env.LEMON_SQUEEZY_AGENCY_VARIANT_ID),
  };
  return <><main className="min-h-screen bg-[#05070b] px-5 py-16 text-white sm:px-8"><div className="mx-auto max-w-6xl"><Link href="/" className="text-sm text-emerald-300">← CiteMend</Link><h1 className="mt-8 text-4xl font-semibold">Pricing</h1><p className="mt-3 max-w-2xl text-sm text-slate-400">Choose a configured monthly plan. Your checkout shows the final price and billing terms before purchase.</p><div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{offers.map(offer => <article key={offer.name} className="flex min-h-64 flex-col rounded-xl border border-white/10 bg-white/[.03] p-5"><h2 className="text-xl font-semibold">{offer.name}</h2><p className="mt-3 flex-1 text-sm leading-6 text-slate-400">{offer.description}</p><div className="mt-6">{!offer.tier ? <Link href="/forensic-scan" className="inline-flex rounded-lg border border-white/20 px-4 py-2 text-sm">Run free scan</Link> : clerkReady && available[offer.tier] ? <BillingCheckoutButton tier={offer.tier} label={`Choose ${offer.name}`} /> : <Link href="/support" className="text-sm text-emerald-300 underline">Ask about availability</Link>}</div></article>)}</div></div></main><SiteFooter /></>;
}
