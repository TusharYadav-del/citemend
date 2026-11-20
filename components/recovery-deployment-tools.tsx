"use client";

import { useState } from "react";

type Finding = { id: string; domain: string; normalized_path: string; suggested_target_url: string | null; approval_status: string; guardrail_classification: string };

export function RecoveryDeploymentTools({ domain, findings }: { domain: string; findings: Finding[] }) {
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function download(format: "csv" | "json") {
    if (!domain) return;
    setBusy(`export-${format}`); setNotice("");
    try {
      const response = await fetch(`/api/recovery/cloudflare-export?domain=${encodeURIComponent(domain)}&format=${format}`);
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Export failed.");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `citemend-cloudflare-redirects.${format}`; anchor.click(); URL.revokeObjectURL(url);
      setNotice(`Cloudflare ${format.toUpperCase()} file downloaded.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Export failed."); }
    finally { setBusy(""); }
  }

  async function run(action: "verify" | "shopify", finding: Finding) {
    setBusy(`${action}-${finding.id}`); setNotice("");
    try {
      const response = await fetch(action === "verify" ? "/api/recovery/verify" : "/api/recovery/deploy/shopify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, findingId: finding.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed.");
      setNotice(action === "verify" ? result.reason : result.verification?.reason ? `Shopify redirect deployed. ${result.verification.reason}` : "Shopify redirect deployed.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(""); }
  }

  const usable = findings.filter(row => row.domain === domain && row.guardrail_classification === "recoverable_equivalent" && row.suggested_target_url && ["approved", "deployed"].includes(row.approval_status));
  return <section aria-label="Redirect deployment tools" className="mb-6 rounded-xl border border-border bg-surface p-5">
    <h2 className="text-base font-semibold text-foreground">Approved Redirect Deployment</h2>
    <p className="mt-1 text-xs leading-5 text-text-secondary">Export approved rules for Cloudflare Bulk Redirects, deploy an approved finding to Shopify, or verify a live one-hop 301/302.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={!domain || !!busy} onClick={() => void download("csv")} className="rounded-md border border-border px-3 py-2 text-xs text-foreground hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">{busy === "export-csv" ? "Preparing CSV…" : "Download Cloudflare CSV"}</button>
      <button type="button" disabled={!domain || !!busy} onClick={() => void download("json")} className="rounded-md border border-border px-3 py-2 text-xs text-foreground hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">{busy === "export-json" ? "Preparing JSON…" : "Download Cloudflare JSON"}</button>
    </div>
    {usable.slice(0, 8).map(finding => <div key={finding.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised p-3 text-xs"><span className="break-all font-mono text-text-secondary">{finding.normalized_path} → {finding.suggested_target_url}</span><span className="flex gap-2"><button type="button" disabled={!!busy || finding.approval_status !== "approved"} onClick={() => void run("shopify", finding)} className="rounded-md border border-accent/30 px-2.5 py-1.5 text-accent hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">{busy === `shopify-${finding.id}` ? "Deploying…" : "Deploy Shopify"}</button><button type="button" disabled={!!busy} onClick={() => void run("verify", finding)} className="rounded-md border border-border px-2.5 py-1.5 text-foreground hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">{busy === `verify-${finding.id}` ? "Verifying…" : "Verify Live"}</button></span></div>)}
    {notice && <p role="status" className="mt-3 rounded-md border border-success/20 bg-success/5 p-3 text-xs text-success">{notice}</p>}
  </section>;
}
