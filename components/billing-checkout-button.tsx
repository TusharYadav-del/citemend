"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BillingTier } from "@/lib/billing-checkout";

export function BillingCheckoutButton({ tier, label }: { tier: BillingTier; label: string }) {
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
        const returnTo = `${window.location.pathname}${window.location.search}` || "/pricing";
        router.push(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
        return;
      }
      const body = await response.json() as { checkoutUrl?: unknown; error?: unknown };
      if (!response.ok || typeof body.checkoutUrl !== "string") {
        throw new Error(typeof body.error === "string" ? body.error : "Checkout is temporarily unavailable.");
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
    <button type="button" onClick={() => void checkout()} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-[#07110d] disabled:opacity-60">
      {busy && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-[#07110d]/30 border-t-[#07110d]" />}
      {busy ? "Opening checkout…" : label}
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
  </div>;
}
