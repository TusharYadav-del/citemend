"use client";

import { useEffect, useState } from "react";
import { BillingCheckoutButton } from "./billing-checkout-button";
import type { BillingTier } from "@/lib/billing-checkout";
import { Check, CreditCard } from "lucide-react";

type BillingStatus = {
  plan: "free" | "starter" | BillingTier;
  status: string;
  active: boolean;
  hasSubscription: boolean;
  renewsAt: string | null;
  endsAt: string | null;
  testMode: boolean;
  customerPortalUrl: string | null;
  updatePaymentMethodUrl: string | null;
  quotaUsage: { auditsThisMonth: number; monthlyAuditLimit: number };
};

export function BillingPanel({ checkoutReady = true, checkoutMissing = [], selectedTier }: { checkoutReady?: boolean; checkoutMissing?: string[]; selectedTier?: BillingTier }) {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"manage" | "payment" | null>(null);
  useEffect(() => {
    fetch("/api/billing/status", { cache: "no-store" })
      .then(async response => { const data = await response.json().catch(() => null) as (BillingStatus & { error?: string }) | null; if (!response.ok) throw new Error(data?.error ?? "Billing status is unavailable."); if (!data) throw new Error("Billing status returned an unreadable response."); return data as BillingStatus; })
      .then(setBilling).catch(cause => setError(cause instanceof Error ? cause.message : "Billing status is unavailable."));
  }, []);
  async function openPortal(action: "manage" | "payment") {
    setBusy(action); setError("");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json().catch(() => null) as { url?: unknown; error?: unknown } | null;
      if (!response.ok || typeof data?.url !== "string") throw new Error(typeof data?.error === "string" ? data.error : "Billing portal is unavailable.");
      const url = new URL(data.url);
      if (url.protocol !== "https:") throw new Error("Billing portal returned an unsafe URL.");
      window.location.assign(url.href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Billing portal is unavailable."); setBusy(null); }
  }
  const label = billing?.plan ? billing.plan[0].toUpperCase() + billing.plan.slice(1) : "Free";
  const status = billing?.status === "cancelled" && billing.endsAt && billing.active
    ? `Cancelled - Active until ${new Date(billing.endsAt).toLocaleDateString()}`
    : billing?.status === "past_due" ? "Past Due" : billing?.status === "active" ? "Active" : billing?.status ?? "Free";
  const usage = billing ? Math.min(100, Math.round(billing.quotaUsage.auditsThisMonth / Math.max(1, billing.quotaUsage.monthlyAuditLimit) * 100)) : 0;
  return <section id="billing" className="space-y-5">
    <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]"><section className="rounded-xl border border-border bg-surface-raised p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
    <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Current plan &amp; usage</h2><CreditCard className="size-4 text-text-tertiary"/></div>
    {!billing && !error && <p className="mt-2 text-xs text-text-secondary">Loading billing status…</p>}
    {billing && <>
      <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-success/30 px-3 py-1 text-success">{label}</span><span className="rounded-full border border-border px-3 py-1">{status}</span>{billing.testMode && <span className="rounded-full border border-warning/50 px-3 py-1 text-warning">Test Mode Active</span>}</div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs"><span className="text-text-secondary">Monthly audit usage</span><span className="font-mono tabular-nums text-foreground">{billing.quotaUsage.auditsThisMonth} / {billing.quotaUsage.monthlyAuditLimit}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-soft" role="progressbar" aria-label="Monthly audit usage" aria-valuemin={0} aria-valuemax={billing.quotaUsage.monthlyAuditLimit} aria-valuenow={billing.quotaUsage.auditsThisMonth}><div className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${usage}%` }}/></div>{billing.renewsAt && <p className="mt-2 text-[11px] text-text-tertiary">Renews {new Date(billing.renewsAt).toLocaleDateString()}</p>}
      {billing.hasSubscription && <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void openPortal("manage")} disabled={!!busy} className="rounded-md border border-success/30 px-3 py-2 text-xs font-semibold text-success hover:bg-success/5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60">{busy === "manage" ? "Opening…" : "Manage Billing"}</button>
        <button type="button" onClick={() => void openPortal("payment")} disabled={!!busy} className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60">{busy === "payment" ? "Opening…" : "Update Payment Method"}</button>
      </div>}
    </>}
    {error && <p role="alert" className="mt-3 text-xs text-warning">{error}</p>}
    {!checkoutReady && <p role="status" className="mt-3 text-xs text-warning">Dodo checkout setup is incomplete. Configure {checkoutMissing.join(", ") || "the billing environment"} on the server.</p>}
    </section><section aria-label="Plan options" className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">{([
      { tier: "pilot" as const, name: "30-Day Recovery Pilot", price: "$149", cadence: "one-time", detail: "One workspace · 30 days" },
      { tier: "growth" as const, name: "Growth Store", price: "$99", cadence: "/ month", detail: "Continuous monitoring" },
      { tier: "agency" as const, name: "Agency Multi-Workspace", price: "$249", cadence: "/ month", detail: "Up to 5 client domains" },
    ]).map(plan => { const selected = selectedTier === plan.tier; return <article key={plan.tier} aria-current={selected ? "step" : undefined} className={`flex min-w-0 flex-col rounded-xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] ${selected ? "border-accent bg-accent/5 ring-1 ring-accent/35" : plan.tier === "pilot" ? "border-accent/35 bg-surface-raised" : "border-border bg-surface"}`}><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md border border-border bg-background"><Check className={`size-3.5 ${selected || plan.tier === "pilot" ? "text-accent-strong" : "text-text-tertiary"}`}/></span><h3 className="text-xs font-semibold text-foreground">{plan.name}</h3>{selected && <span className="ml-auto rounded-full border border-accent/30 px-2 py-0.5 font-mono text-[9px] uppercase text-accent">Selected</span>}</div><p className="mt-4 font-mono text-2xl font-semibold tabular-nums">{plan.price}<span className="ml-1 text-[10px] font-normal text-text-secondary">{plan.cadence}</span></p><p className="mt-1 min-h-8 text-[10px] leading-4 text-text-tertiary">{plan.detail}</p><div className="mt-auto pt-4"><BillingCheckoutButton tier={plan.tier} ready={checkoutReady} label={selected ? `Continue with ${plan.tier === "pilot" ? "Pilot" : plan.tier === "growth" ? "Growth" : "Agency"}` : plan.tier === "pilot" ? "Start $149 Pilot" : plan.tier === "growth" ? "Choose Growth" : "Choose Agency"}/></div></article>; })}</section></div>
  </section>;
}
