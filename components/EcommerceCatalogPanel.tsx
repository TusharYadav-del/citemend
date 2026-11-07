"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { AlertBanner } from "@/components/ui/alert-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type Item = { external_item_id: string; canonical_url: string | null; product_json: Record<string, unknown>; platform: string; attributed_ai_visits: number; estimated_recovered_revenue_usd: number };
function safeProductUrl(value: string | null) {
  try { const parsed = new URL(value ?? ""); return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null; }
  catch { return null; }
}

export default function EcommerceCatalogPanel({ domain }: { domain: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(domain));
  const [loadedDomain, setLoadedDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!domain) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/ecommerce/sync?domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
      const body = await response.json() as { items?: Item[]; error?: string };
      if (!response.ok || !Array.isArray(body.items)) throw new Error(body.error || "Catalog items are unavailable.");
      setItems(body.items); setLoadedDomain(domain); setError(null);
    } catch { setError("Could not load this catalog. Check the workspace connection and try again."); }
    finally { setLoading(false); }
  }, [domain]);
  useEffect(() => {
    if (!domain) return;
    let active = true;
    fetch(`/api/ecommerce/sync?domain=${encodeURIComponent(domain)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as { items?: Item[]; error?: string };
        if (!response.ok || !Array.isArray(body.items)) throw new Error(body.error || "Catalog items are unavailable.");
        return body.items;
      })
      .then(rows => { if (active) { setItems(rows); setLoadedDomain(domain); setError(null); } })
      .catch(() => { if (active) setError("Could not load this catalog. Check the workspace connection and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [domain]);
  const visible = useMemo(() => items.filter(item => `${item.external_item_id} ${item.product_json.title ?? ""} ${item.product_json.variant_sku ?? ""}`.toLowerCase().includes(filter.toLowerCase())), [items, filter]);
  async function sync(file: File) {
    setBusy(true); setError(null); setStatus("");
    try {
      const content = await file.text();
      const response = await fetch("/api/ecommerce/sync", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ domain, source: file.name.toLowerCase().endsWith(".json") ? "json" : "csv", content }) });
      const body = await response.json() as { jobId?: string; synced?: number; error?: string };
      if (!response.ok) throw new Error(body.error || "Catalog sync failed.");
      if (response.status === 202 && body.jobId) {
        setStatus("Catalog sync queued. Track it in Background jobs, then refresh this catalog.");
        window.dispatchEvent(new CustomEvent("citemend:job-created", { detail: body.jobId }));
      } else { setStatus(`Synced ${body.synced ?? 0} catalog items.`); await load(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Catalog sync failed."); }
    finally { setBusy(false); }
  }
  async function exportRedirects() {
    setBusy(true); setError(null); setStatus("");
    try {
      const response = await fetch(`/api/ecommerce/sync?domain=${encodeURIComponent(domain)}&action=redirects`);
      if (!response.ok) throw new Error("Redirect export is unavailable. Check catalog and URL embedding setup.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `shopify-301-${domain}.csv`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Verified pgvector redirect suggestions exported for human review.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Redirect export failed."); }
    finally { setBusy(false); }
  }
  return <section id="ecommerce-catalog" className="my-6 scroll-mt-8 rounded-xl border border-white/[.08] bg-[#0D1119] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-white">Ecommerce Catalog &amp; SKU Recovery</h2><p className="mt-1 text-xs text-slate-400">Validated prices, stock, structured offers and product URLs.</p></div><button type="button" onClick={() => void exportRedirects()} disabled={busy || !domain} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-bold text-black disabled:opacity-50">Bulk Shopify 301 export</button></div>
    <div className="mt-4 flex flex-wrap gap-3"><input aria-label="Filter by SKU" placeholder="Filter by SKU or product" value={filter} onChange={event => setFilter(event.target.value)} className="min-h-10 rounded-lg border border-white/10 bg-black/30 px-3 font-mono text-xs text-white" /><label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-white/10 px-3 text-xs text-white">Upload CSV / JSON<input type="file" accept=".csv,.json" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void sync(file); event.target.value = ""; }} /></label><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs text-slate-300 disabled:opacity-50"><RotateCw className="size-3.5" />Refresh</button>{busy && <span role="status" className="self-center text-xs text-slate-400">Working…</span>}{status && <span role="status" className="self-center text-xs text-slate-300">{status}</span>}</div>
    {!domain ? <div className="mt-4"><EmptyState title="Connect a website first" description="Choose a workspace domain before importing products." action={<Link href="/#audit" className="text-xs font-semibold text-emerald-300">Connect website</Link>} /></div> : loading || loadedDomain !== domain && !error ? <div role="status" aria-label="Loading catalog" className="mt-4 space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : error ? <div className="mt-4"><AlertBanner tone="danger" title="Catalog unavailable">{error}<button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">Retry</button></AlertBanner></div> : visible.length === 0 ? <div className="mt-4"><EmptyState title={filter ? "No matching SKU" : "No catalog items yet"} description={filter ? "Try another product name or clear the SKU filter." : "Upload a CSV or JSON product feed to start URL and offer checks."} action={filter ? <button type="button" onClick={() => setFilter("")} className="text-xs font-semibold text-emerald-300">Clear filter</button> : <label className="cursor-pointer text-xs font-semibold text-emerald-300">Upload product feed<input type="file" accept=".csv,.json" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void sync(file); event.target.value = ""; }} /></label>} /></div> : <div className="mt-4 space-y-2">{visible.slice(0, 50).map(item => { const product = item.product_json; const url = safeProductUrl(item.canonical_url); return <article key={`${item.platform}:${item.external_item_id}`} className="grid grid-cols-12 gap-2 rounded-lg border border-white/[.07] bg-black/20 p-3 text-xs"><div className="col-span-12 min-w-0 lg:col-span-5">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-slate-200 hover:text-emerald-300">{String(product.title ?? item.external_item_id)}</a> : <span className="text-slate-200">{String(product.title ?? item.external_item_id)}</span>}<p className="mt-1 font-mono text-[10px] text-slate-500">SKU {String(product.variant_sku ?? "—")}</p></div><div className="col-span-12 font-mono text-[11px] text-slate-300 lg:col-span-3"><p>Price {String(product.catalog_price ?? "—")} · {product.catalog_in_stock === true ? "In stock" : product.catalog_in_stock === false ? "Out of stock" : "Stock unknown"}</p><p>HTTP {String(product.http_status ?? "unknown")}</p></div><div className="col-span-12 text-[11px] text-slate-400 lg:col-span-4"><p className="font-mono tabular-nums">{item.attributed_ai_visits.toLocaleString()} measured AI visits</p><p className="font-mono tabular-nums">Estimated Recovered Revenue ${item.estimated_recovered_revenue_usd.toLocaleString()} · estimate, not realized</p>{product.http_status === 404 && <p className="text-rose-300">Variant URL needs recovery</p>}{product.price_mismatch === true && <p className="text-amber-300">Price mismatch</p>}{product.availability_mismatch === true && <p className="text-amber-300">Availability mismatch</p>}</div></article>; })}</div>}
  </section>;
}
