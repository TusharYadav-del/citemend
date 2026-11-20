"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BillingTier } from "@/lib/billing-checkout";
import { billingSignInHref } from "@/lib/billing-flow";

export function BillingCheckoutButton({ tier, label, ready = true }: { tier: BillingTier; label: string; ready?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function checkout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (response.status === 401) {
        router.push(billingSignInHref(tier));
        return;
      }
      const body = await response.json().catch(() => null) as { checkoutUrl?: unknown; error?: unknown } | null;
      if (!response.ok || typeof body?.checkoutUrl !== "string") {
        throw new Error(typeof body?.error === "string" ? body.error : "Checkout is temporarily unavailable.");
      }
      const url = new URL(body.checkoutUrl);
      if (url.protocol !== "https:") throw new Error("Checkout returned an unsafe URL.");
      window.location.assign(url.href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout is temporarily unavailable.");
      setBusy(false);
    }
  }

  return <div>
    <button type="button" onClick={() => void checkout()} disabled={busy || !ready} title={!ready ? "Dodo Payments checkout configuration is incomplete." : undefined} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60">
      {busy && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-[#07110d]/30 border-t-[#07110d]" />}
      {busy ? "Opening checkout…" : label}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
  </div>;
}
