import Link from "next/link";
import { ArrowUpRight, Check, Clock3, Repeat2 } from "lucide-react";
import { BillingCheckoutButton } from "@/components/billing-checkout-button";
import { isBillingEnabled } from "@/lib/billing-checkout";

const offers = [
  { name: "Pilot", tier: "pilot" as const, price: "$149", cadence: "one-time", detail: "30-day pilot", description: "A focused recovery pilot for one commerce workspace.", icon: Clock3 },
  { name: "Growth", tier: "growth" as const, price: "$99", cadence: "/ month", detail: "Billed monthly", description: "Recurring recovery monitoring for a commerce team.", icon: Repeat2 },
  { name: "Agency", tier: "agency" as const, price: "$249", cadence: "/ month", detail: "Billed monthly", description: "Multi-client recovery workflows and client-ready reports.", icon: Repeat2 },
];

type PricingTier = (typeof offers)[number]["tier"];

export function PublicPricingPlans({ mode = "compact", tiers, billingReady: billingReadyOverride, showUnavailableMessage = true }: { mode?: "compact" | "page"; tiers?: readonly { tier: PricingTier }[]; billingReady?: boolean; showUnavailableMessage?: boolean }) {
  const billingReady = billingReadyOverride ?? isBillingEnabled();
  const isPage = mode === "page";
  const visibleOffers = tiers ? tiers.map(({ tier }) => offers.find((offer) => offer.tier === tier)).filter((offer): offer is (typeof offers)[number] => Boolean(offer)) : offers;

  return (
    <section id="pricing" aria-labelledby="pricing-heading" className={isPage ? "mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8" : "cm-container py-[var(--space-section)]"}>
      <div className={isPage ? "max-w-3xl" : "mx-auto max-w-3xl text-center"}>
        <p className="cm-kicker">Clear plan terms</p>
        {isPage ? <h1 id="pricing-heading" className="mt-3 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">Pricing</h1> : <h2 id="pricing-heading" className="mt-3 text-3xl font-semibold tracking-[-.045em] sm:text-5xl">Start with a pilot. Scale when you’re ready.</h2>}
        <p className="mt-4 max-w-2xl text-base leading-7 text-text-secondary">A one-time 30-day Pilot, or monthly plans for ongoing recovery work. Dodo Payments shows the final billing details before purchase.</p>
      </div>

      {!billingReady && showUnavailableMessage && <p role="status" className="mx-auto mt-6 max-w-3xl rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">Paid checkout is temporarily unavailable. Please try again later.</p>}

      <div className="mt-8 grid gap-3 md:grid-cols-3 sm:mt-10">
        {visibleOffers.map(({ name, tier, price, cadence, detail, description, icon: Icon }) => (
          <article key={tier} className="flex min-w-0 flex-col rounded-lg border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold text-foreground">{name}</h3><Icon aria-hidden="true" className="size-4 text-accent" /></div>
            <p className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground">{price}</span><span className="text-sm text-text-secondary">{cadence}</span></p>
            <p className="mt-1 font-mono text-xs text-text-tertiary">{detail}</p>
            <p className="mt-4 min-h-12 text-sm leading-6 text-text-secondary">{description}</p>
            <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm text-text-secondary">
              <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />No automatic redirects</li>
              <li className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />Review before deployment</li>
            </ul>
            <div className="mt-6"><BillingCheckoutButton tier={tier} label={tier === "pilot" ? "Start the Pilot" : `Choose ${name}`} /></div>
          </article>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-text-tertiary">
        <p>Redirects require review and approval. AI answer visibility is observed, not guaranteed.</p>
        {!isPage && <Link href="/pricing" className="inline-flex min-h-10 items-center gap-1.5 font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">Compare plan terms <ArrowUpRight aria-hidden="true" className="size-4" /></Link>}
      </div>
    </section>
  );
}
