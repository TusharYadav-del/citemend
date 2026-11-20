import type { Metadata } from "next";
import { PublicPricingPlans } from "@/components/public-pricing-plans";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isBillingEnabled } from "@/lib/billing-checkout";

export const metadata: Metadata = {
  title: "Pricing | CiteMend",
  description: "Choose a $149 one-time 30-day Pilot, $99/month Growth, or $249/month Agency plan.",
  openGraph: { type: "website", title: "Pricing | CiteMend", description: "$149 one-time 30-day Pilot, $99/month Growth, and $249/month Agency." },
};

const checkoutTiers = [{ tier: "pilot" as const }, { tier: "growth" as const }, { tier: "agency" as const }];

export default function PricingPage() {
  const billingReady = isBillingEnabled();
  return <>
    <SiteHeader />
    <main className="min-h-[70vh] bg-background text-foreground">
      {!billingReady && <p role="status" className="mx-auto mt-6 max-w-6xl rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">Paid checkout is temporarily unavailable. Please try again later.</p>}
      <PublicPricingPlans mode="page" tiers={checkoutTiers} billingReady={billingReady} showUnavailableMessage={false} />
      <section aria-labelledby="pricing-notes-heading" className="mx-auto mb-16 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 border-t border-border pt-8 lg:grid-cols-[.7fr_1.3fr]">
          <div><p className="cm-kicker">Operating principles</p><h2 id="pricing-notes-heading" className="mt-3 text-2xl font-semibold tracking-tight">Recovery stays reviewable.</h2><p className="mt-3 text-sm leading-6 text-text-secondary">Every plan keeps evidence, approvals, and deployment checks visible to the team responsible for the domain.</p></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-lg border border-border bg-surface p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-accent">01 · Provenance</p><p className="mt-2 text-sm font-semibold">Evidence before action</p><p className="mt-2 text-xs leading-5 text-text-secondary">URL state and source context stay inspectable.</p></article>
            <article className="rounded-lg border border-border bg-surface p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-warning">02 · Guardrail</p><p className="mt-2 text-sm font-semibold">No blind redirects</p><p className="mt-2 text-xs leading-5 text-text-secondary">A person reviews each proposed destination.</p></article>
            <article className="rounded-lg border border-border bg-surface p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">03 · Verification</p><p className="mt-2 text-sm font-semibold">Outcomes stay distinct</p><p className="mt-2 text-xs leading-5 text-text-secondary">Deployment does not stand in for a later citation.</p></article>
          </div>
        </div>
        <div className="mt-10 grid gap-3 border-t border-border pt-8 md:grid-cols-2">
          <details className="group rounded-lg border border-border bg-surface p-4"><summary className="cursor-pointer list-none text-sm font-semibold">Does a 301 prove a citation was recovered?</summary><p className="mt-3 text-sm leading-6 text-text-secondary">No. Deployment, destination health, later AI citation observation, referral visits, and revenue attribution are separate evidence milestones.</p></details>
          <details className="group rounded-lg border border-border bg-surface p-4"><summary className="cursor-pointer list-none text-sm font-semibold">Will CiteMend automatically redirect every 404?</summary><p className="mt-3 text-sm leading-6 text-text-secondary">No. Soft-404 guardrails block weak or unsafe matches, and a person must review and approve a redirect before deployment.</p></details>
        </div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
