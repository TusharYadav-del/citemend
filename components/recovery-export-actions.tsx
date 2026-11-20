"use client";

import { useState } from "react";
import { toast } from "sonner";

export function RecoveryExportActions({ domain }: { domain: string }) {
  const [busy, setBusy] = useState<"csv" | "json" | null>(null);
  async function download(format: "csv" | "json") {
    if (!domain || busy) return;
    setBusy(format);
    try {
      const response = await fetch(`/api/recovery/cloudflare-export?domain=${encodeURIComponent(domain)}&format=${format}`, { cache: "no-store" });
      if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; throw new Error(data.error ?? "Cloudflare export could not be prepared."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `citemend-cloudflare-redirects.${format}`; link.click(); URL.revokeObjectURL(url); toast.success(`Cloudflare ${format.toUpperCase()} export downloaded.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Cloudflare export could not be prepared."); }
    finally { setBusy(null); }
  }
  return <div className="flex flex-wrap gap-2"><button type="button" disabled={!domain || !!busy} onClick={() => void download("csv")} className="rounded-md border border-border px-3 py-2 text-xs text-foreground disabled:opacity-50">{busy === "csv" ? "Preparing CSV…" : "Export Cloudflare CSV"}</button><button type="button" disabled={!domain || !!busy} onClick={() => void download("json")} className="rounded-md border border-border px-3 py-2 text-xs text-foreground disabled:opacity-50">{busy === "json" ? "Preparing JSON…" : "Export Cloudflare JSON"}</button></div>;
}
