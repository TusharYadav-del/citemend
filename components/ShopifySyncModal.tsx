"use client";

import { useState, type FormEvent } from "react";
import { Check, LoaderCircle, RefreshCw, ShoppingBag, TriangleAlert, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type RedirectToSync = { id: string; sourcePath: string };
type Result = { ruleId: string; sourcePath: string; status: "synced" | "already_synced" | "skipped_inactive" | "failed" | "created_needs_review"; message?: string };
type ShopifySyncModalProps = { domain: string; redirectRules: RedirectToSync[]; onSynced?: () => void };

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {}
  return "The request could not be completed. Try again.";
}

export default function ShopifySyncModal({ domain, redirectRules, onSynced }: ShopifySyncModalProps) {
  const [open, setOpen] = useState(false);
  const [shopSubdomain, setShopSubdomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [connectedShop, setConnectedShop] = useState("");
  const [showReconnect, setShowReconnect] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  async function openModal(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen || !domain) return;
    setError("");
    try {
      const response = await fetch(`/api/integrations/shopify/connect?domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response));
      const data = await response.json() as { connected?: boolean; shopSubdomain?: string | null };
      setConnectedShop(data.connected && typeof data.shopSubdomain === "string" ? data.shopSubdomain : "");
      if (data.connected) setShowReconnect(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shopify connection status is unavailable.");
    }
  }

  async function connectShopify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("connect");
    setError("");
    try {
      const response = await fetch("/api/integrations/shopify/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, shopSubdomain: shopSubdomain.trim(), accessToken }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const data = await response.json() as { connected?: boolean; shopName?: string; shopSubdomain?: string };
      if (!data.connected || typeof data.shopSubdomain !== "string") throw new Error("Shopify returned an incomplete connection confirmation.");
      setConnectedShop(data.shopSubdomain);
      setShopSubdomain(data.shopSubdomain);
      setAccessToken("");
      setShowReconnect(false);
      setResults([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shopify could not be connected.");
    } finally {
      setBusy("");
    }
  }

  async function syncRedirects() {
    if (!domain || !redirectRules.length || busy) return;
    setBusy("sync");
    setError("");
    setResults([]);
    const allResults: Result[] = [];
    try {
      // Keep each request bounded; Shopify API calls are executed sequentially server-side.
      for (let offset = 0; offset < redirectRules.length; offset += 50) {
        const batch = redirectRules.slice(offset, offset + 50);
        const response = await fetch("/api/integrations/shopify/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, redirectRuleIds: batch.map(rule => rule.id) }),
        });
        if (!response.ok) throw new Error(await responseMessage(response));
        const data = await response.json() as { results?: Result[] };
        if (!Array.isArray(data.results)) throw new Error("Shopify returned an incomplete sync report.");
        allResults.push(...data.results);
        setResults([...allResults]);
      }
      onSynced?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shopify sync did not finish.");
    } finally {
      setBusy("");
    }
  }

  const failedCount = results.filter(result => result.status === "failed" || result.status === "created_needs_review").length;
  const syncableCount = redirectRules.length;

  return <>
    <button type="button" onClick={() => void openModal(true)} disabled={!domain} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#214d39] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#183e2d] disabled:cursor-not-allowed disabled:opacity-50">
      <ShoppingBag className="size-4" /> ðŸ›ï¸ 1-Click Sync to Shopify Admin
    </button>
    <Dialog open={open} onOpenChange={value => void openModal(value)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-white p-5 text-[#182c25] sm:max-w-2xl sm:p-7">
        <DialogHeader>
          <DialogTitle className="pr-8 text-xl font-semibold">Push approved redirects to Shopify</DialogTitle>
          <DialogDescription>Connect a Shopify custom app, then publish active redirect rules for {domain || "your domain"} to Shopify Admin â†’ Content â†’ Menus â†’ URL Redirects.</DialogDescription>
        </DialogHeader>

        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{error}</div>}

        {!connectedShop || showReconnect ? <form onSubmit={connectShopify} className="space-y-4 rounded-xl border border-[#e3e9e0] bg-[#fbfcfa] p-4 sm:p-5">
          <div><p className="text-sm font-semibold text-[#24372b]">Step 1 · Connect your store</p><p className="mt-1 text-xs leading-5 text-[#708074]">Create a Shopify custom app and enable the <code>write_online_store_navigation</code> Admin API scope.</p></div>
          <label className="block text-xs font-medium text-[#526457]">Shop subdomain
            <input required autoCapitalize="none" autoCorrect="off" spellCheck={false} value={shopSubdomain} onChange={event => setShopSubdomain(event.target.value)} placeholder="acme-store.myshopify.com" className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe5dc] bg-white px-3 text-sm text-[#182c25] placeholder:text-[#929b92]" />
          </label>
          <label className="block text-xs font-medium text-[#526457]">Admin API access token
            <input required type="password" autoComplete="new-password" value={accessToken} onChange={event => setAccessToken(event.target.value)} placeholder="shpat_…" className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe5dc] bg-white px-3 text-sm text-[#182c25] placeholder:text-[#929b92]" />
          </label>
          <p className="text-[11px] leading-5 text-[#7c887f]">CiteFix verifies the store, encrypts the token before saving, and never sends it back to your browser. You can revoke the custom app token in Shopify Admin.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy === "connect" || !shopSubdomain.trim() || !accessToken} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7e1d0] bg-white px-4 text-sm font-semibold text-[#31563b] hover:bg-[#f3f7ef] disabled:opacity-50">{busy === "connect" ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}Verify and Connect</button>
            {connectedShop && <button type="button" onClick={() => { setShowReconnect(false); setAccessToken(""); }} className="h-10 rounded-lg px-3 text-sm text-[#6c786f] hover:bg-white">Cancel</button>}
          </div>
        </form> : <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div><p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><Check className="size-4" /> Shopify connected</p><p className="mt-1 text-xs text-emerald-800">{connectedShop}</p></div>
          <button type="button" onClick={() => setShowReconnect(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-900 hover:bg-emerald-100"><RefreshCw className="size-3.5" />Reconnect</button>
        </div>}

        {connectedShop && !showReconnect && <section className="mt-4 rounded-xl border border-[#e3e9e0] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#24372b]">Step 2 · Sync active redirects</p><p className="mt-1 text-xs leading-5 text-[#708074]">Only active rules that you approved are sent. Already-synced rules are safely skipped.</p></div><span className="rounded-full bg-[#f1f5ed] px-3 py-1.5 text-xs font-semibold text-[#44653c]">{syncableCount} eligible</span></div>
          <button type="button" onClick={() => void syncRedirects()} disabled={!syncableCount || busy === "sync"} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#214d39] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#183e2d] disabled:cursor-not-allowed disabled:opacity-50">{busy === "sync" ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}ðŸ›ï¸ 1-Click Sync to Shopify Admin ({syncableCount})</button>
          {!syncableCount && <p className="mt-3 text-xs text-[#7b877d]">There are no active redirect rules for this domain yet. Enable a verified rule in the recovered traffic table first.</p>}
          {results.length > 0 && <div className="mt-4 space-y-2" role="status" aria-live="polite"><p className={`text-sm font-semibold ${failedCount ? "text-amber-800" : "text-emerald-800"}`}>{results.filter(item => item.status === "synced").length} added · {results.filter(item => item.status === "already_synced").length} already present · {results.filter(item => item.status === "skipped_inactive").length} inactive · {failedCount} need review</p><ul className="max-h-44 space-y-1 overflow-y-auto text-xs text-[#5f6e62]">{results.map(result => <li key={result.ruleId} className="flex flex-wrap justify-between gap-2"><span className="font-mono">{result.sourcePath}</span><span>{result.status.replaceAll("_", " ")}{result.message ? ` · ${result.message}` : ""}</span></li>)}</ul></div>}
        </section>}
      </DialogContent>
    </Dialog>
  </>;
}
