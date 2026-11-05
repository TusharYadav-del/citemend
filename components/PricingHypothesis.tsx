"use client";
import { useState } from "react";

const tiers = [
  ["Free Audit", "$0", "₹0", "Lead generation and sample findings"],
  ["Starter", "$49–$79/mo", "₹2,999/mo", "Small websites"],
  ["Growth", "$149–$249/mo", "₹8,999/mo", "SaaS companies"],
  ["Professional", "$399–$599/mo", "₹19,999/mo", "Larger SaaS and ecommerce"],
  ["Agency", "$699–$999/mo", "₹34,999/mo", "Multi-client agencies and white-label reports"],
  ["Enterprise", "$2,500–$10,000+/mo", "Custom", "SSO, RBAC, and custom quotas"],
];
export default function PricingHypothesis() {
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  return <div className="mx-auto mt-8 max-w-7xl rounded-2xl border border-white/10 bg-white/[.02] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Six-tier roadmap hypothesis</h3><p className="mt-1 text-[11px] text-slate-500">Planning ranges only; they are not live checkout products or billing entitlements.</p></div><div role="group" aria-label="Pricing currency" className="inline-flex rounded-full border border-white/10 p-1"><button type="button" aria-pressed={currency === "USD"} onClick={() => setCurrency("USD")} className={`rounded-full px-3 py-1.5 text-xs ${currency === "USD" ? "bg-emerald-300 text-[#07110d]" : "text-slate-400"}`}>USD $</button><button type="button" aria-pressed={currency === "INR"} onClick={() => setCurrency("INR")} className={`rounded-full px-3 py-1.5 text-xs ${currency === "INR" ? "bg-emerald-300 text-[#07110d]" : "text-slate-400"}`}>INR ₹</button></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{tiers.map(([name, usd, inr, description]) => <article key={name} className="rounded-xl border border-white/[.08] bg-black/20 p-3"><div className="flex items-baseline justify-between gap-2"><h4 className="text-xs font-semibold text-slate-200">{name}</h4><span className="text-xs font-semibold text-emerald-300">{currency === "USD" ? usd : inr}</span></div><p className="mt-1 text-[11px] text-slate-500">{description}</p></article>)}</div></div>;
}
