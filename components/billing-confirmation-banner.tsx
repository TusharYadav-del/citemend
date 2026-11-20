"use client";

import { useEffect, useState } from "react";
import type { BillingTier } from "@/lib/billing-checkout";

type ConfirmationState = "confirming" | "confirmed" | "pending";
type StoredConfirmation = { key: string; state: ConfirmationState };

export function BillingConfirmationBanner({ active, tier }: { active: boolean; tier?: BillingTier }) {
  const [stored, setStored] = useState<StoredConfirmation | null>(null);
  const key = tier ?? "any";
  const state = stored?.key === key ? stored.state : active ? "confirming" : null;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const check = async () => {
      attempt++;
      try {
        const response = await fetch("/api/billing/status", { cache: "no-store" });
        const data = await response.json().catch(() => null) as { active?: unknown; plan?: unknown } | null;
        if (!stopped && response.ok && data?.active === true && (!tier || data.plan === tier)) {
          setStored({ key, state: "confirmed" });
          return;
        }
      } catch { /* The verified billing status endpoint remains the source of truth. */ }
      if (stopped) return;
      if (attempt >= 8) { setStored({ key, state: "pending" }); return; }
      timer = setTimeout(() => void check(), 2_000);
    };
    void check();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [active, tier, key]);

  if (!active || !state) return null;
  const content = state === "confirmed"
    ? "Payment confirmed. Your subscription is active."
    : state === "confirming"
      ? "Confirming your payment with Dodo Payments…"
      : "Your payment is still processing. Access will update after the verified payment webhook is received; check back in a moment.";
  return <div role="status" aria-live="polite" className={`rounded-lg border p-4 text-sm ${state === "confirmed" ? "border-success/25 bg-success/5 text-success" : "border-warning/25 bg-warning/5 text-warning"}`}><strong>{state === "confirmed" ? "Payment confirmed" : state === "confirming" ? "Confirming your payment…" : "Payment processing"}</strong><p className="mt-1 text-xs leading-5 text-text-secondary">{content}</p></div>;
}
