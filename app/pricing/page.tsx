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
      <section aria-labelledby="pricing-notes-heading" className="mx-auto mb-16 max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
          <div><h2 id="pricing-notes-heading" className="font-mono text-[10px] font-medium uppercase tracking-[.12em] text-text-tertiary">Billing</h2><p className="mt-2 text-sm leading-6 text-text-secondary">Pilot is a one-time 30-day purchase. Growth and Agency are billed monthly. Dodo Payments displays the checkout total before you confirm.</p></div>
          <div><h2 className="font-mono text-[10px] font-medium uppercase tracking-[.12em] text-text-tertiary">Recovery controls</h2><p className="mt-2 text-sm leading-6 text-text-secondary">CiteMend checks evidence and prepares recovery actions for review. Redirects are not deployed automatically.</p></div>
        </div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
