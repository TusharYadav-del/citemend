"use client";

import { useEffect, useRef } from "react";
import { BillingCheckoutButton } from "@/components/billing-checkout-button";

export default function UpgradeModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="upgrade-title" className="m-auto w-[min(92vw,32rem)] rounded-2xl border border-[#dfe5dc] bg-white p-0 text-[#182c25] shadow-2xl backdrop:bg-black/50">
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold tracking-widest text-[#53704e]">CITEMEND PLANS</p><h2 id="upgrade-title" className="mt-3 text-2xl font-semibold">Choose a paid plan</h2></div>
          <button type="button" onClick={onClose} aria-label="Close upgrade dialog" className="rounded-md px-2 py-1 text-xl leading-none text-[#68736b] hover:bg-[#f1f4eb]">&times;</button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#68736b]">Choose a plan to continue. Checkout opens securely with Dodo Payments.</p>
        <div className="mt-5 grid gap-3">
          <BillingCheckoutButton tier="pilot" label="Pilot · $149 one-time" />
          <BillingCheckoutButton tier="growth" label="Growth · $99/month" />
          <BillingCheckoutButton tier="agency" label="Agency · $249/month" />
        </div>
        <button type="button" onClick={onClose} className="mt-4 text-sm text-[#68736b] underline">Maybe later</button>
      </div>
    </dialog>
  );
}
