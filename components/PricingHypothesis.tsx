"use client";
import { useState } from "react";
import { COMMERCIAL_TIERS, contractPriceRange, type CommercialTier } from "@/lib/billing";

const tiers = Object.entries(COMMERCIAL_TIERS) as [CommercialTier, (typeof COMMERCIAL_TIERS)[CommercialTier]][];
const formatter = (value: number, currency: "USD" | "INR") => new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

export default function PricingHypothesis() {
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  const [cadence, setCadence] = useState<"monthly" | "annual">("monthly");
  return <div className="mx-auto mt-8 max-w-7xl rounded-2xl border border-white/10 bg-white/[.02] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Six-tier contract pricing model</h3><p className="mt-1 text-[11px] text-slate-500">Planning ranges only. Annual prices start at 10 months; the estimated cost floor can reduce that discount to preserve a modeled 75% gross margin. These are not live checkout products.</p></div>
      <div className="flex flex-wrap gap-2"><div role="group" aria-label="Pricing currency" className="inline-flex rounded-full border border-white/10 p-1">{(["USD", "INR"] as const).map(value => <button key={value} type="button" aria-pressed={currency === value} onClick={() => setCurrency(value)} className={`rounded-full px-3 py-1.5 text-xs ${currency === value ? "bg-emerald-300 text-[#07110d]" : "text-slate-400"}`}>{value === "USD" ? "USD $" : "INR ₹"}</button>)}</div>
      <div role="group" aria-label="Contract billing term" className="inline-flex rounded-full border border-white/10 p-1">{(["monthly", "annual"] as const).map(value => <button key={value} type="button" aria-pressed={cadence === value} onClick={() => setCadence(value)} className={`rounded-full px-3 py-1.5 text-xs capitalize ${cadence === value ? "bg-emerald-300 text-[#07110d]" : "text-slate-400"}`}>{value}</button>)}</div></div>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{tiers.map(([key, tier]) => {
      const price = contractPriceRange(key, currency, cadence);
      const shown = price.min === null ? "Custom quote" : price.max === null ? `${formatter(price.min, currency)}+` : price.min === price.max ? formatter(price.min, currency) : `${formatter(price.min, currency)}–${formatter(price.max, currency)}`;
      return <article key={key} className="rounded-xl border border-white/[.08] bg-black/20 p-3"><div className="flex items-baseline justify-between gap-2"><h4 className="text-xs font-semibold text-slate-200">{tier.label}</h4><span className="text-right text-xs font-semibold text-emerald-300">{shown}<small className="ml-1 text-[10px] font-normal text-slate-500">/{cadence === "annual" ? "year" : "month"}</small></span></div><p className="mt-1 text-[11px] text-slate-500">{tier.description}{tier.checkoutPlan === "quote_only" ? " · Quote only until checkout is configured" : ""}{cadence === "annual" && price.discountPercent > 0 ? ` · ${price.discountPercent}% annual discount at the starting price` : ""}{price.marginFloorApplied ? " · Cost floor applied to the 75% modeled margin target" : ""}</p></article>;
    })}</div>
    <p className="mt-3 text-[10px] leading-5 text-slate-500">Cost floors use the current tier scan/model-call quotas, estimated model spend, and the configurable shared infrastructure budget. INR floor calculations use the configurable CITEMEND_ESTIMATED_INR_PER_USD assumption. Existing hosted checkout remains limited to the configured Pro and Agency monthly variants; annual terms and other tiers require billing variant setup and measured-cost review before sale.</p>
  </div>;
}
