"use client";

import { useState } from "react";
import { SignInButton, useUser } from "@clerk/nextjs";
import type { BillingTier } from "@/lib/billing-checkout";

export function BillingCheckoutButton({ tier, label }: { tier: BillingTier; label: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const className = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-[#07110d] disabled:opacity-60";
  async function checkout() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier }) });
      const body = await response.json() as { checkoutUrl?: unknown; error?: unknown };
      if (!response.ok || typeof body.checkoutUrl !== "string") throw new Error(typeof body.error === "string" ? body.error : "Checkout is unavailable.");
      const url = new URL(body.checkoutUrl);
      if (url.protocol !== "https:") throw new Error("Checkout returned an unsafe URL.");
      window.location.assign(url.href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Checkout is unavailable."); setBusy(false); }
  }
  return <div>
    {!isLoaded ? <button type="button" disabled className={className}>Loading…</button>
      : !isSignedIn ? <SignInButton mode="modal"><button type="button" className={className}>Sign in to {label.toLowerCase()}</button></SignInButton>
        : <button type="button" onClick={() => void checkout()} disabled={busy} className={className}>
          {busy && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-[#07110d]/30 border-t-[#07110d]" />}
          {busy ? "Opening checkout…" : label}
        </button>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
  </div>;
}
