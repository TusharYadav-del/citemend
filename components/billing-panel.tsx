"use client";

import { useEffect, useState } from "react";
import { BillingCheckoutButton } from "./billing-checkout-button";
import type { BillingTier } from "@/lib/billing-checkout";

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

export function BillingPanel() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"manage" | "payment" | null>(null);
  useEffect(() => {
    fetch("/api/billing/status", { cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Billing status is unavailable."); return data as BillingStatus; })
      .then(setBilling).catch(cause => setError(cause instanceof Error ? cause.message : "Billing status is unavailable."));
  }, []);
  async function openPortal(action: "manage" | "payment") {
    setBusy(action); setError("");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json() as { url?: unknown; error?: unknown };
      if (!response.ok || typeof data.url !== "string") throw new Error(typeof data.error === "string" ? data.error : "Billing portal is unavailable.");
      const url = new URL(data.url);
      if (url.protocol !== "https:") throw new Error("Billing portal returned an unsafe URL.");
      window.location.assign(url.href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Billing portal is unavailable."); setBusy(null); }
  }
  const label = billing?.plan ? billing.plan[0].toUpperCase() + billing.plan.slice(1) : "Free";
  const status = billing?.status === "cancelled" && billing.endsAt && billing.active
    ? `Cancelled - Active until ${new Date(billing.endsAt).toLocaleDateString()}`
    : billing?.status === "past_due" ? "Past Due" : billing?.status === "active" ? "Active" : billing?.status ?? "Free";
  return <section id="billing" className="mb-5 rounded-xl border border-border bg-surface p-4">
    <h2 className="text-sm font-semibold">Billing</h2>
    {!billing && !error && <p className="mt-2 text-xs text-text-secondary">Loading billing status…</p>}
    {billing && <>
      <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-success/30 px-3 py-1 text-success">{label}</span><span className="rounded-full border border-border px-3 py-1">{status}</span>{billing.testMode && <span className="rounded-full border border-warning/50 px-3 py-1 text-warning">Test Mode Active</span>}</div>
      <p className="mt-3 text-xs text-text-secondary">Audits this month: {billing.quotaUsage.auditsThisMonth} of {billing.quotaUsage.monthlyAuditLimit}{billing.renewsAt ? ` · Renews ${new Date(billing.renewsAt).toLocaleDateString()}` : ""}</p>
      {billing.hasSubscription && <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void openPortal("manage")} disabled={!!busy} className="rounded-md border border-success/30 px-3 py-2 text-xs font-semibold text-success hover:bg-success/5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60">{busy === "manage" ? "Opening…" : "Manage Subscription / Download Invoices"}</button>
        <button type="button" onClick={() => void openPortal("payment")} disabled={!!busy} className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60">{busy === "payment" ? "Opening…" : "Update Payment Method"}</button>
      </div>}
      {!billing.active && <div className="mt-4 flex flex-wrap gap-3">{(["pilot", "growth", "agency"] as const).map(tier => <BillingCheckoutButton key={tier} tier={tier} label={tier === "pilot" ? "Start $149 Pilot" : `Choose ${tier[0].toUpperCase() + tier.slice(1)}`} />)}</div>}
    </>}
    {error && <p role="alert" className="mt-3 text-xs text-warning">{error}</p>}
    {!billing && <div className="mt-4 flex flex-wrap gap-3">{(["pilot", "growth", "agency"] as const).map(tier => <BillingCheckoutButton key={tier} tier={tier} label={tier === "pilot" ? "Start $149 Pilot" : `Choose ${tier[0].toUpperCase() + tier.slice(1)}`} />)}</div>}
  </section>;
}
