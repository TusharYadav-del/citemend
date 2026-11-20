"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useWorkspace } from "@/components/workspace-provider";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";

export function ConnectDomainForm({ initialDomain = "", compact = false }: { initialDomain?: string; compact?: boolean }) {
  const [domain, setDomain] = useState(initialDomain);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { addWorkspaceDomain } = useWorkspace();
  const router = useRouter();

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    let normalized: string;
    try { normalized = normalizeDashboardDomain(domain); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Enter a valid public domain."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/workspaces/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: normalized }) });
      const result = await response.json().catch(() => null) as { domain?: unknown; error?: unknown } | null;
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "The workspace could not be saved.");
      if (typeof result?.domain !== "string") throw new Error("The workspace service returned an unreadable response.");
      addWorkspaceDomain(result.domain);
      setDomain(result.domain);
      setMessage(`${result.domain} connected and selected.`);
      toast.success(`${result.domain} connected`);
      router.refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The workspace could not be saved.";
      setMessage(detail); toast.error(detail);
    } finally { setBusy(false); }
  }

  return <form onSubmit={connect} className={compact ? "flex flex-wrap items-end gap-2" : "rounded-xl border border-border bg-surface-raised p-5"}>
    {!compact && <><h2 className="text-sm font-semibold">Connect a domain</h2><p className="mt-1 text-xs text-text-secondary">Save a workspace now. You can run its first audit whenever you’re ready.</p></>}
    <label className={compact ? "grid min-w-48 flex-1 gap-1 text-xs text-text-secondary" : "mt-3 grid gap-1 text-xs text-text-secondary"}>Public domain
      <input required type="text" value={domain} onChange={event => setDomain(event.target.value)} placeholder="example.com" className="rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground" />
    </label>
    <button type="submit" disabled={busy || !domain.trim()} className="min-h-10 rounded-md bg-accent px-4 text-xs font-semibold text-background disabled:opacity-50">{busy ? "Connecting…" : "Connect domain"}</button>
    {message && <p role="status" className="basis-full text-xs text-text-secondary">{message}</p>}
  </form>;
}
