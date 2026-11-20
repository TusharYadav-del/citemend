"use client";

import { useState } from "react";

export function ProvenanceIngestionSnippet({ domain }: { domain: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = `POST /api/provenance\nHost: your-citemend-domain\nContent-Type: application/json\nx-citemend-timestamp: <unix-seconds>\nx-citemend-signature: sha256=<HMAC-SHA256(timestamp + "." + exact-raw-body)>\n\n{"domain":"${domain}","source":"cloudflare_logpush","events":[{"type":"crawler_fetch","url":"https://${domain}/products/example","userAgent":"GPTBot/1.0"}]}`;
  async function copy() {
    try { await navigator.clipboard.writeText(snippet); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }
  return <section className="rounded-xl border border-border bg-surface-raised p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-accent">Trusted event setup</p><h2 className="mt-1 font-semibold">Crawler log ingestion</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-text-secondary">Sign each raw request with a server-only secret. Never place that secret in browser code; user-agent matches alone do not verify a crawler.</p></div><button type="button" onClick={() => void copy()} className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-soft">{copied ? "Copied" : "Copy example"}</button></div>
    <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-background p-3 text-[10px] leading-5 text-text-secondary"><code>{snippet}</code></pre>
    <p className="mt-3 text-[10px] leading-4 text-text-tertiary">Configure <code>PROVENANCE_LOG_INGEST_SECRET</code> on the server and in your trusted adapter. Batches are signed, timestamp-checked, and limited to 100 events / 64 KiB.</p>
  </section>;
}
