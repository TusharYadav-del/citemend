import Link from "next/link";
import { ArrowUpRight, Check, Clock3, Repeat2 } from "lucide-react";
import { BillingCheckoutButton } from "@/components/billing-checkout-button";
import { isBillingEnabled } from "@/lib/billing-checkout";

const offers = [
  { name: "30-Day Recovery Pilot", tier: "pilot" as const, price: "$149", cadence: "one-time", detail: "One workspace · 30 days", description: "A focused first recovery cycle: establish URL evidence, review findings, and verify approved changes.", icon: Clock3, points: ["One-time purchase", "Evidence-led URL review", "Human approval before deployment"] },
  { name: "Growth Store", tier: "growth" as const, price: "$99", cadence: "/ month", detail: "Continuous monitoring", description: "A steady operating workspace for teams maintaining a single commerce domain.", icon: Repeat2, points: ["Ongoing 404 and citation monitoring", "Soft-404 guardrails", "Monthly recovery report"] },
  { name: "Agency Multi-Workspace", tier: "agency" as const, price: "$249", cadence: "/ month", detail: "Up to 5 client domains", description: "Keep client evidence and recovery workflows organized across a shared agency workspace.", icon: Repeat2, points: ["Multi-workspace client context", "Client-ready reports", "Reviewed recovery actions"] },
];

type PricingTier = (typeof offers)[number]["tier"];

export function PublicPricingPlans({ mode = "compact", tiers, billingReady: billingReadyOverride, showUnavailableMessage = true }: { mode?: "compact" | "page"; tiers?: readonly { tier: PricingTier }[]; billingReady?: boolean; showUnavailableMessage?: boolean }) {
  const billingReady = billingReadyOverride ?? isBillingEnabled();
  const isPage = mode === "page";
  const visibleOffers = tiers ? tiers.map(({ tier }) => offers.find((offer) => offer.tier === tier)).filter((offer): offer is (typeof offers)[number] => Boolean(offer)) : offers;

  return (
    <section id="pricing" aria-labelledby="pricing-heading" className={isPage ? "mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8" : "cm-container py-[var(--space-section)]"}>
      <div className={isPage ? "grid gap-8 border-b border-border pb-8 lg:grid-cols-[1fr_.65fr] lg:items-end" : "mx-auto max-w-3xl text-center"}>
        <div><p className="cm-kicker">Clear plan terms · Dodo Payments</p>
          {isPage ? <h1 id="pricing-heading" className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Start with a verified recovery pilot.</h1> : <h2 id="pricing-heading" className="mt-3 text-3xl font-semibold tracking-[-.045em] sm:text-5xl">Start with a pilot. Scale when you’re ready.</h2>}
        </div>
        <p className="max-w-xl text-sm leading-7 text-text-secondary sm:text-base">Begin with 30 days of focused recovery work, then continue with monthly monitoring when the ongoing workflow fits. Dodo Payments shows the final billing details before purchase.</p>
      </div>

      {!billingReady && showUnavailableMessage && <p role="status" className="mx-auto mt-6 max-w-3xl rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">Paid checkout is temporarily unavailable. Please try again later.</p>}

      <div className="mt-8 grid gap-3 lg:grid-cols-[.92fr_1.08fr_.92fr] lg:items-stretch sm:mt-10">
        {visibleOffers.map(({ name, tier, price, cadence, detail, description, icon: Icon, points }) => (
          <article key={tier} className={`relative flex min-w-0 flex-col rounded-xl border p-5 transition-colors sm:p-6 ${tier === "growth" ? "border-accent/35 bg-surface-raised shadow-panel lg:-translate-y-2" : "border-border bg-surface"}`}>
            {tier === "growth" && <span className="absolute -top-3 left-5 rounded-sm border border-accent/30 bg-background px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-accent">Continuous plan</span>}
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.12em] text-text-tertiary">{tier === "pilot" ? "01 / Prove" : tier === "growth" ? "02 / Monitor" : "02 / Manage clients"}</p><h3 className="mt-3 text-lg font-semibold leading-6 text-foreground">{name}</h3></div><span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-background text-text-secondary"><Icon aria-hidden="true" className="size-4" /></span></div>
            <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="font-mono text-4xl font-semibold tracking-tight tabular-nums text-foreground">{price}</span><span className="text-sm text-text-secondary">{cadence}</span></p>
            <p className="mt-1 font-mono text-xs text-text-tertiary">{detail}</p>
            <p className="mt-4 min-h-14 text-sm leading-6 text-text-secondary">{description}</p>
            <ul className="mt-5 space-y-3 border-t border-border pt-5 text-sm text-text-secondary">
              {points.map(point => <li key={point} className="flex gap-2.5"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" /><span>{point}</span></li>)}
            </ul>
            <div className="mt-auto pt-6"><BillingCheckoutButton tier={tier} label={tier === "pilot" ? "Start $149 Pilot" : `Choose ${tier === "growth" ? "Growth" : "Agency"}`} /></div>
          </article>
        ))}
      </div>
      <div className="mt-6 grid gap-4 border-t border-border pt-5 text-xs leading-5 text-text-tertiary sm:grid-cols-3">
        <p><span className="font-medium text-text-secondary">Billing:</span> Pilot is a one-time 30-day purchase. Growth and Agency are monthly.</p>
        <p><span className="font-medium text-text-secondary">Control:</span> Redirects require review and approval. CiteMend does not promise AI answer visibility.</p>
        <p><span className="font-medium text-text-secondary">Checkout:</span> Secure checkout and final terms are provided by Dodo Payments.</p>
      </div>
      {!isPage && <Link href="/pricing" className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">Compare plan terms <ArrowUpRight aria-hidden="true" className="size-4" /></Link>}
    </section>
  );
}
