import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { PublicPricingPlans } from "@/components/public-pricing-plans";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isBillingEnabled } from "@/lib/billing-checkout";
import { SectionHeading } from "@/components/ui/section-heading";

export const metadata: Metadata = {
  title: "Pricing | CiteMend",
  description: "Choose a $149 one-time Recovery Pilot, $99/month Growth Store, or $249/month Agency Multi-Workspace plan.",
  alternates: { canonical: "/pricing" },
  openGraph: { type: "website", url: "/pricing", title: "Pricing | CiteMend", description: "$149 Recovery Pilot, $99/month Growth, and $249/month Agency plans." },
};

const checkoutTiers = [{ tier: "pilot" as const }, { tier: "growth" as const }, { tier: "agency" as const }];
const rows: [string, boolean, boolean, boolean][] = [
  ["One workspace · 30 days", true, true, true],
  ["Live URL and broken-citation checks", true, true, true],
  ["Human-approved recovery actions", true, true, true],
  ["Continuous monitoring", false, true, true],
  ["GEO extractability checks", false, true, true],
  ["Monthly 4-metric retention report", false, true, true],
  ["Client domains", false, false, true],
  ["White-label ROI reports", false, false, true],
];

export default function PricingPage() {
  const billingReady = isBillingEnabled();
  return <><SiteHeader/><main className="min-h-[70vh] bg-background text-foreground">
    {!billingReady && <p role="status" className="mx-auto mt-6 max-w-6xl rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">Paid checkout is temporarily unavailable. Please try again later.</p>}
    <PublicPricingPlans mode="page" tiers={checkoutTiers} billingReady={billingReady} showUnavailableMessage={false}/>
    <section aria-labelledby="comparison-heading" className="cm-container pb-16"><div className="border-t border-border pt-12"><SectionHeading eyebrow="Compare plans" title="Know what each workspace includes." description="All tiers use the same evidence and approval safeguards. There are no per-engine add-on fees."/><div className="mt-7 overflow-x-auto rounded-xl border border-border bg-surface"><table className="w-full min-w-[42rem] text-left text-sm"><thead><tr className="border-b border-border bg-surface-raised"><th id="comparison-heading" className="px-4 py-4 font-medium text-text-secondary">Included capability</th><th className="px-4 py-4 font-semibold">Pilot</th><th className="px-4 py-4 font-semibold text-accent">Growth</th><th className="px-4 py-4 font-semibold">Agency</th></tr></thead><tbody className="divide-y divide-border">{rows.map(([label,...values])=><tr key={label}><th scope="row" className="px-4 py-3 font-medium text-text-secondary">{label}</th>{values.map((included,i)=><td key={i} className="px-4 py-3">{included?<Check aria-label="Included" className="size-4 text-accent"/>:<Minus aria-label="Not included" className="size-4 text-text-tertiary"/>}</td>)}</tr>)}</tbody></table></div><p className="mt-4 text-xs leading-5 text-text-tertiary">Annual maintenance is $990/year for Growth and $2,490/year for Agency. The Pilot is a $149 one-time purchase for 30 days. Dodo Payments presents final billing terms before purchase.</p></div></section>
    <section aria-labelledby="pricing-faq" className="cm-container border-t border-border py-16"><div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:gap-12"><SectionHeading eyebrow="Questions, answered" title="Safety and setup stay straightforward."/><div className="space-y-2">{[
      ["Is recovery safe for SEO?", "CiteMend checks evidence and proposes reviewable changes. It does not redirect every 404, and a person approves destinations before deployment."],
      ["How does soft-404 protection work?", "Low-confidence or unrelated matches, redirect loops, and chains are blocked from deployment recommendations. A discontinued page can remain a 404/410."],
      ["How do Shopify and Cloudflare connect?", "Shopify uses its redirect API after workspace authorization. Cloudflare supports an approved bulk redirect export for the site's existing deployment workflow."],
      ["Can I cancel a monthly plan?", "Growth and Agency are recurring monthly plans. Billing and cancellation controls are available through the customer billing portal."],
    ].map(([q,a])=><details key={q} className="group rounded-lg border border-border bg-surface px-4 py-4 sm:px-5"><summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-5 text-sm font-semibold marker:content-none focus-visible:outline-2 focus-visible:outline-accent"><span>{q}</span><span className="font-mono text-text-tertiary transition-transform group-open:rotate-45">+</span></summary><p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">{a}</p></details>)}</div></div></section>
  </main><SiteFooter/></>;
}
