"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import { toast } from "sonner";

export default function CheckoutButton({ plan }: { plan?: "pro" | "agency" } = {}) {
  const { isSignedIn, isLoaded } = useUser();
  const [betaMode, setBetaMode] = useState<boolean | null>(null);
  const [subscription, setSubscription] = useState<{ state: string; plan?: string; currentPeriodEnd: string | null; daysRemaining: number | null } | null>(null);
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [betaOpen, setBetaOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [betaResult, setBetaResult] = useState<{ unlocked: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/lemonsqueezy/checkout", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { mode?: string }) => setBetaMode(data.mode === "beta"))
      .catch(() => setBetaMode(true));
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/subscription/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { state?: string; plan?: string; currentPeriodEnd?: string | null } | null) => {
        if (data?.state) setSubscription({ state: data.state, plan: data.plan, currentPeriodEnd: data.currentPeriodEnd ?? null, daysRemaining: data.currentPeriodEnd ? Math.max(0, Math.ceil((Date.parse(data.currentPeriodEnd) - Date.now()) / 86_400_000)) : null });
      }).catch(() => {});
  }, [isSignedIn, betaResult]);

  useEffect(() => {
    if (betaOpen && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [betaOpen]);

  async function requestBeta(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/beta-request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }),
      });
      const result: unknown = await response.json();
      if (!result || typeof result !== "object") throw new Error("Beta activation is temporarily unavailable.");
      const payload = result as { unlocked?: unknown; message?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Beta activation is temporarily unavailable.");
      if (typeof payload.unlocked !== "boolean" || typeof payload.message !== "string") throw new Error("Beta activation returned an unexpected response.");
      setBetaResult({ unlocked: payload.unlocked, message: payload.message });
      setSubscription({ state: payload.unlocked ? "active_beta" : "pending_beta", currentPeriodEnd: typeof (result as { currentPeriodEnd?: unknown }).currentPeriodEnd === "string" ? (result as { currentPeriodEnd: string }).currentPeriodEnd : null, daysRemaining: payload.unlocked ? 30 : null });
      if (payload.unlocked) {
        toast.success(payload.message);
        router.refresh();
      } else toast.info(payload.message);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Beta activation is temporarily unavailable.";
      setError(message);
      toast.error(message);
    } finally { setPending(false); }
  }

  async function startCheckout(plan: "pro" | "agency") {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/lemonsqueezy/checkout?plan=${plan}`, { method: "POST" });
      const result: unknown = await response.json();
      if (response.ok && result && typeof result === "object" && (result as { betaMode?: boolean }).betaMode) {
        setBetaMode(true);
        setBetaResult(null);
        setBetaOpen(true);
        setPending(false);
        return;
      }
      if (!response.ok || !result || typeof result !== "object" || typeof (result as { checkoutUrl?: unknown }).checkoutUrl !== "string") {
        const message = result && typeof result === "object" && typeof (result as { error?: unknown }).error === "string"
          ? (result as { error: string }).error
          : "Checkout is temporarily unavailable. Please try again.";
        throw new Error(message);
      }
      toast.info((result as { testMode?: boolean }).testMode ? "Opening Lemon Squeezy test checkout. No live payment will be charged." : `Opening secure checkout for Citemend ${plan === "agency" ? "Agency" : "Pro"}.`);
      window.location.assign((result as { checkoutUrl: string }).checkoutUrl);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Checkout is temporarily unavailable. Please try again.";
      setError(message);
      toast.error(message);
      setPending(false);
    }
  }

  if (plan) return <div>
    {!isLoaded ? <button type="button" disabled className="w-full rounded-full bg-emerald-300 px-4 py-3 text-sm font-bold text-[#06110b] opacity-60">Loading checkout…</button>
      : !isSignedIn ? <SignInButton mode="modal"><button type="button" className="w-full rounded-full bg-emerald-300 px-4 py-3 text-sm font-bold text-[#06110b] hover:bg-emerald-200">Sign in to choose {plan === "agency" ? "Agency" : "Pro"}</button></SignInButton>
        : betaMode === true ? plan === "pro" ? <button type="button" onClick={() => { setError(""); setBetaResult(null); setBetaOpen(true); }} className="w-full rounded-full bg-emerald-300 px-4 py-3 text-sm font-bold text-[#06110b]">Request free Pro beta</button> : <p className="rounded-xl border border-amber-300/15 bg-amber-300/[.05] p-3 text-xs leading-5 text-amber-100">Agency checkout is unavailable while the invite beta is active.</p>
          : <button type="button" onClick={() => void startCheckout(plan)} disabled={pending || subscription?.state === "paid" && subscription.plan === plan} className="w-full rounded-full bg-emerald-300 px-4 py-3 text-sm font-bold text-[#06110b] hover:bg-emerald-200 disabled:opacity-60">{pending ? "Opening secure checkout…" : subscription?.state === "paid" && subscription.plan === plan ? `${plan === "agency" ? "Agency" : "Pro"} plan active` : `Choose ${plan === "agency" ? "Agency" : "Pro"}`}</button>}
    {!betaMode && error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
    {plan === "agency" && subscription?.state === "paid" && subscription.plan !== "agency" && <p className="mt-2 text-[10px] leading-5 text-slate-500">Agency checkout creates a separate subscription. Manage your existing Pro subscription to avoid overlapping charges.</p>}
  </div>;

  return (
    <div>
      {subscription?.state === "active_beta" && subscription.currentPeriodEnd && <p role="status" className="mb-2 text-sm font-medium text-[#214d39]">Pro Beta Active · {subscription.daysRemaining} days remaining</p>}
      {subscription?.state === "expired_beta" && <p role="status" className="mb-2 text-sm font-medium text-amber-800">Beta Access Expired · Your 30-day Pro Beta access has expired. Upgrade to Pro when paid plans become available.</p>}
      {subscription?.state === "pending_beta" && <p role="status" className="mb-2 text-sm font-medium text-[#214d39]">Beta Request Pending</p>}
      {!isLoaded ? <button type="button" disabled className="rounded-lg bg-[#214d39] px-4 py-2.5 text-sm font-semibold text-white opacity-60">Loading...</button>
        : !isSignedIn ? <SignInButton mode="modal"><button type="button" className="rounded-lg bg-[#214d39] px-4 py-2.5 text-sm font-semibold text-white">Sign in to upgrade</button></SignInButton>
          : <button type="button" onClick={betaMode ? () => { setError(""); setBetaResult(null); setBetaOpen(true); } : () => void startCheckout("pro")} disabled={pending || subscription?.state === "active_beta" || subscription?.state === "paid"} className="rounded-lg bg-[#214d39] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#153c2a] disabled:cursor-wait disabled:opacity-60">
            {pending ? "Please wait..." : subscription?.state === "active_beta" ? "Pro Beta Active" : subscription?.state === "pending_beta" ? "Beta Request Pending" : subscription?.state === "expired_beta" ? "Beta Access Expired" : subscription?.state === "paid" ? subscription.plan === "agency" ? "Agency Active" : "Pro Active" : betaMode === true ? "Upgrade to Pro" : betaMode === false ? "Upgrade to Pro ($39/mo)" : "Check Pro availability"}
          </button>}
      {isSignedIn && betaMode === false && <div className="mt-2"><button type="button" onClick={() => void startCheckout("agency")} disabled={pending || subscription?.plan === "agency" && subscription.state === "paid"} className="rounded-lg border border-[#5c8965] px-4 py-2.5 text-sm font-semibold text-[#214d39] disabled:opacity-60">{subscription?.plan === "agency" && subscription.state === "paid" ? "Agency Active" : "Choose Agency ($249/mo)"}</button>{subscription?.state === "paid" && subscription.plan !== "agency" && <p className="mt-2 max-w-xs text-xs text-[#68736b]">Agency checkout creates a separate subscription. Manage your existing Pro subscription to avoid overlapping charges.</p>}</div>}
      {!betaMode && error && <p role="alert" className="mt-2 max-w-xs text-xs leading-5 text-red-800">{error}</p>}
      {betaMode && betaOpen && <dialog ref={dialogRef} onClose={() => setBetaOpen(false)} aria-labelledby="beta-title" className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-[#dfe5dc] bg-white p-6 text-[#182c25] shadow-2xl backdrop:bg-black/50 sm:p-8">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#53704e]">Citemend design-partner beta</p><h2 id="beta-title" className="mt-2 text-2xl font-semibold">30 days of Pro, free</h2></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close beta request" className="rounded-md px-2 py-1 text-xl leading-none text-[#68736b] hover:bg-[#f1f4eb]">&times;</button></div>
        {betaResult?.unlocked ? <div role="status" className="mt-6 rounded-xl bg-[#eef7e8] p-4"><p className="font-semibold">{betaResult.message}</p><p className="mt-3 text-sm leading-6 text-[#4c6351]">Your Pro access is active now. Weekly scan delivery begins when production scheduling is switched on; no payment was taken.</p></div> : betaResult ? <p role="status" className="mt-6 rounded-xl bg-[#eef7e8] p-4 text-sm leading-6">{betaResult.message} Pro access is not active yet.</p> : <form onSubmit={requestBeta} className="mt-5"><p className="text-sm leading-6 text-[#68736b]">Enter the domain you want monitored. We&apos;ll use your signed-in account email for the request. No payment details are needed.</p><label htmlFor="beta-domain" className="mt-5 block text-sm font-medium">Your domain</label><input id="beta-domain" type="text" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="yourbrand.com" required maxLength={300} disabled={pending} className="mt-2 h-11 w-full rounded-lg border border-[#d2dacc] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#759d68]" /><button type="submit" disabled={pending} className="mt-5 w-full rounded-lg bg-[#214d39] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Saving your request..." : "Request free Pro beta"}</button>{error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}</form>}
      </dialog>}
    </div>
  );
}
