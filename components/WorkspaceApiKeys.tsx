"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertBanner } from "@/components/ui/alert-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type ApiKeyRow = { id: string; key_prefix: string; permissions_json: string[]; rate_limit_per_minute: number; last_used_at: string | null; revoked_at: string | null };

export default function WorkspaceApiKeys({ domains, initialDomain }: { domains: string[]; initialDomain?: string }) {
  const [domain, setDomain] = useState(initialDomain && domains.includes(initialDomain) ? initialDomain : domains[0] ?? "");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [secret, setSecret] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(domain));
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!domain) return;
    const response = await fetch(`/api/settings/api-keys?domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
    const data = await response.json() as { keys?: ApiKeyRow[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "API keys could not be loaded.");
    setKeys(data.keys ?? []);
  }, [domain]);

  useEffect(() => {
    if (!domain) return;
    let cancelled = false;
    fetch(`/api/settings/api-keys?domain=${encodeURIComponent(domain)}`, { cache: "no-store" })
      .then(async response => { const data = await response.json() as { keys?: ApiKeyRow[]; error?: string }; if (!response.ok) throw new Error(data.error ?? "API keys could not be loaded."); return data; })
      .then(data => { if (!cancelled) { setKeys(data.keys ?? []); setLoadError(""); setLoading(false); } })
      .catch(error => { if (!cancelled) { setLoadError(error instanceof Error ? error.message : "API keys could not be loaded."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [domain]);

  async function create() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/settings/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, permissions: ["audit:read", "evidence:read", "recovery:read", "recovery:propose"] }) });
      const data = await response.json() as { key?: string; error?: string };
      if (!response.ok || !data.key) throw new Error(data.error ?? "API key could not be created.");
      setSecret(data.key); await load(); setNotice("Key created. Copy it now; it cannot be shown again."); toast.success("Workspace API key created.");
    } catch (error) { const message = error instanceof Error ? error.message : "API key could not be created."; setNotice(message); toast.error(message); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/settings/api-keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Key could not be revoked.");
      await load(); setNotice("API key revoked."); toast.success("Workspace API key revoked.");
    } catch (error) { const message = error instanceof Error ? error.message : "Key could not be revoked."; setNotice(message); toast.error(message); }
    finally { setBusy(false); }
  }

  async function copyKey() {
    try { await navigator.clipboard.writeText(secret); toast.success("API key copied."); }
    catch { toast.error("Could not access the clipboard. Select and copy the key manually."); }
  }

  async function retry() {
    setLoading(true); setLoadError("");
    try { await load(); } catch (error) { setLoadError(error instanceof Error ? error.message : "API keys could not be loaded."); }
    finally { setLoading(false); }
  }

  return <section className="mb-6 rounded-xl border border-border bg-surface-raised p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Workspace API keys</h2><p className="mt-1 text-xs text-text-secondary">Scoped keys are stored as SHA-256 hashes. The full secret appears once.</p></div><button type="button" disabled={busy || !domain} onClick={() => void create()} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">{busy ? "Working…" : "Create API key"}</button></div>
    {domains.length > 1 && <label className="mt-3 block text-xs text-text-secondary">Domain <select value={domain} onChange={event => { setDomain(event.target.value); setSecret(""); setNotice(""); }} className="ml-2 rounded bg-slate-800 p-2">{domains.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    {secret && <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3"><label className="min-w-0 flex-1 text-xs text-amber-100">Copy this key now<input readOnly value={secret} onFocus={event => event.currentTarget.select()} className="mt-1 w-full rounded border border-border bg-surface-raised p-2 font-mono text-xs text-foreground" /></label><button type="button" onClick={() => void copyKey()} className="rounded border border-border px-3 py-2 text-xs">Copy key</button></div>}
    {!domain ? <div className="mt-3"><EmptyState title="No workspace selected" description="Connect a domain before creating an API key." action={<Link href="/dashboard/scanner" className="text-xs font-semibold text-accent">Connect website</Link>} /></div>
      : loading ? <div role="status" aria-label="Loading API keys" className="mt-3 space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      : loadError ? <div className="mt-3"><AlertBanner tone="danger" title="API keys are unavailable">{loadError}<button type="button" disabled={loading} onClick={() => void retry()} className="ml-2 font-semibold underline">Retry</button></AlertBanner></div>
      : keys.length === 0 ? <div className="mt-3"><EmptyState title="No API keys yet" description="Create a scoped key to access the public API or MCP tools." action={<button type="button" disabled={busy} onClick={() => void create()} className="text-xs font-semibold text-accent">Create first key</button>} /></div>
      : <ul className="mt-3 space-y-2">{keys.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-raised p-3 text-xs"><span className="font-mono text-foreground">{item.key_prefix}… {item.revoked_at ? "· revoked" : `· ${item.rate_limit_per_minute}/min`}</span>{!item.revoked_at && <button type="button" disabled={busy} onClick={() => void revoke(item.id)} className="rounded border border-rose-300/20 px-2 py-1 text-rose-300">{busy ? "Working…" : "Revoke"}</button>}</li>)}</ul>}
    <p role="status" className="mt-2 text-xs text-accent">{notice}</p>
  </section>;
}
