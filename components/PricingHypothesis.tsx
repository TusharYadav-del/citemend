"use client";
import { useState } from "react";
import Link from "next/link";
import { COMMERCIAL_TIERS, contractPriceRange, type CommercialTier } from "@/lib/billing";

const tiers = Object.entries(COMMERCIAL_TIERS) as [CommercialTier, (typeof COMMERCIAL_TIERS)[CommercialTier]][];
const formatter = (value: number, currency: "USD" | "INR") => new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const audiences: Record<CommercialTier, string> = {
  free_audit: "For a first evidence check",
  starter: "For Small Websites",
  growth: "For B2B SaaS Teams",
  professional: "For Scaling SaaS & Ecommerce",
  agency: "For Multi-Client SEO/GEO Agencies",
  enterprise: "For Enterprise Teams",
};

export default function PricingHypothesis() {
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  const [cadence, setCadence] = useState<"monthly" | "annual">("monthly");
  return <div className="mx-auto mt-8 max-w-7xl">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">Six-tier contract pricing</h3><p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">Published planning ranges. Annual prices begin at ten months of fees; a modeled delivery-cost floor may reduce the discount. Plans without configured checkout are quoted directly.</p></div>
      <div className="flex flex-wrap gap-2"><div role="group" aria-label="Pricing currency" className="inline-flex rounded-full border border-white/10 p-1">{(["USD", "INR"] as const).map(value => <button key={value} type="button" aria-pressed={currency === value} onClick={() => setCurrency(value)} className={`rounded-full px-3 py-1.5 text-xs ${currency === value ? "bg-emerald-300 text-[#07110d]" : "text-slate-400"}`}>{value === "USD" ? "USD $" : "INR ₹"}</button>)}</div>
      <div role="group" aria-label="Contract billing term" className="inline-flex rounded-full border border-white/10 p-1">{(["monthly", "annual"] as const).map(value => <button key={value} type="button" aria-pressed={cadence === value} onClick={() => setCadence(value)} className={`rounded-full px-3 py-1.5 text-xs capitalize ${cadence === value ? "bg-emerald-300 text-[#07110d]" : "text-slate-400"}`}>{value}</button>)}</div></div>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tiers.map(([key, tier]) => {
      const price = contractPriceRange(key, currency, cadence);
      const shown = price.min === null ? "Custom quote" : price.max === null ? `${formatter(price.min, currency)}+` : price.min === price.max ? formatter(price.min, currency) : `${formatter(price.min, currency)}–${formatter(price.max, currency)}`;
      return <article key={key} className={`flex min-h-52 flex-col rounded-xl border p-5 ${key === "growth" ? "border-emerald-300/30 bg-emerald-300/[.055]" : "border-white/[.08] bg-white/[.025]"}`}><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-emerald-300">{audiences[key]}</p><h4 className="mt-2 text-lg font-semibold text-white">{tier.label}</h4><p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-white">{shown}<small className="ml-1 text-[10px] font-normal text-slate-500">/{cadence === "annual" ? "year" : "month"}</small></p><p className="mt-2 text-xs leading-5 text-slate-400">{tier.description}{tier.checkoutPlan === "quote_only" ? " · Quote only until checkout is configured" : ""}{cadence === "annual" && price.discountPercent > 0 ? ` · ${price.discountPercent}% annual discount at the starting price` : ""}{price.marginFloorApplied ? " · Cost floor applied to the 75% modeled margin target" : ""}</p></div><Link href={key === "free_audit" ? "/forensic-scan" : "/design-partners"} className="mt-auto inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-emerald-200 hover:border-emerald-300/40">{key === "free_audit" ? "Run free scan" : "Discuss this plan"}</Link></article>;
    })}</div>
    <p className="mt-3 text-[10px] leading-5 text-slate-500">Cost floors use the current tier scan/model-call quotas, estimated model spend, and the configurable shared infrastructure budget. INR floor calculations use the configurable CITEMEND_ESTIMATED_INR_PER_USD assumption. Existing hosted checkout remains limited to the configured Pro and Agency monthly variants; annual terms and other tiers require billing variant setup and measured-cost review before sale.</p>
  </div>;
}
