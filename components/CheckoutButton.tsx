"use client";

import { useState } from "react";

export default function CheckoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/lemonsqueezy/checkout", { method: "POST" });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || typeof (result as { checkoutUrl?: unknown }).checkoutUrl !== "string") {
        const message = result && typeof result === "object" && typeof (result as { error?: unknown }).error === "string"
          ? (result as { error: string }).error
          : "Checkout is temporarily unavailable. Please try again.";
        throw new Error(message);
      }
      window.location.assign((result as { checkoutUrl: string }).checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout is temporarily unavailable. Please try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={startCheckout} disabled={pending} className="rounded-lg bg-[#214d39] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#153c2a] disabled:cursor-wait disabled:opacity-60">
        {pending ? "Opening secure checkout..." : "Upgrade to Pro ($39/mo)"}
      </button>
      {error && <p role="alert" className="mt-2 max-w-xs text-xs leading-5 text-red-800">{error}</p>}
    </div>
  );
}
