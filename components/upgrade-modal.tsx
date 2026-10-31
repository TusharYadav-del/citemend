"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import CheckoutButton from "@/components/CheckoutButton";

export default function UpgradeModal({ onClose, signedIn = true }: { onClose: () => void; signedIn?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="upgrade-title" className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-[#dfe5dc] bg-white p-0 text-[#182c25] shadow-2xl backdrop:bg-black/50">
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold tracking-widest text-[#53704e]">CITEMEND PRO</p><h2 id="upgrade-title" className="mt-3 text-2xl font-semibold">Upgrade to Pro</h2></div>
          <button type="button" onClick={onClose} aria-label="Close upgrade dialog" className="rounded-md px-2 py-1 text-xl leading-none text-[#68736b] hover:bg-[#f1f4eb]">&times;</button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#68736b]">Unlock unlimited audits and one-click redirect exports. Weekly scans run for eligible Pro accounts when scheduling is active.</p>
        <p className="mt-5 text-lg font-semibold">$39 <span className="text-sm font-normal text-[#68736b]">/ month</span></p>
        <div className="mt-5">{signedIn ? <CheckoutButton /> : <Link href="/#audit" className="inline-flex rounded-lg bg-[#214d39] px-4 py-3 text-sm font-semibold text-white">Sign in to upgrade</Link>}</div>
        <button type="button" onClick={onClose} className="mt-4 text-sm text-[#68736b] underline">Maybe later</button>
      </div>
    </dialog>
  );
}
