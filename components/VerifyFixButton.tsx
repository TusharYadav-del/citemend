"use client";

import { useState } from "react";

export default function VerifyFixButton({ auditId, brokenLinkId }: { auditId: string; brokenLinkId: string }) {
  const [pending, setPending] = useState(false);
  const [indexNowKey, setIndexNowKey] = useState("");
  const [result, setResult] = useState<{ verified?: boolean; technical_deployment_verified?: boolean; ai_citation_observed?: boolean; badge?: string | null; indexNow?: { status?: string }; indexNowNote?: string; aiCitationNote?: string; error?: string; warning?: string } | null>(null);
  async function verify() {
    setPending(true); setResult(null);
    try {
      const response = await fetch("/api/verify-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId, brokenLinkId, ...(indexNowKey.trim() ? { indexNowKey: indexNowKey.trim() } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not verify this fix.");
      setResult(data);
    } catch (error) { setResult({ error: error instanceof Error ? error.message : "Could not verify this fix." }); }
    finally { setPending(false); }
  }
  return <div className="mt-3">
    <details className="mb-2"><summary className="cursor-pointer text-[11px] text-slate-500">IndexNow key setup (optional)</summary><label className="mt-2 block text-[11px] text-slate-400">Key used by the matching {"{key}"}.txt file at your domain root<input value={indexNowKey} onChange={event => setIndexNowKey(event.target.value)} autoComplete="off" maxLength={128} className="mt-1 min-h-9 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-xs text-white" placeholder="Paste IndexNow key" /></label></details>
    <button type="button" onClick={verify} disabled={pending} className="min-h-10 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60">{pending ? "Checking deployment and a new observation…" : "Verify Deployment & Subsequent Citation"}</button>
    {result?.badge && <p role="status" className="mt-2 text-xs font-semibold text-emerald-300">{result.badge}</p>}
    {result && !result.error && <div className="mt-2 space-y-1 text-[11px]"><p className="text-slate-300">Technical deployment: {result.technical_deployment_verified ? "verified" : "not verified"}</p><p className="text-slate-300">Subsequent AI citation: {result.ai_citation_observed ? "observed" : "not observed"}</p><p className="text-slate-500">{result.aiCitationNote}</p><p className="text-slate-500">{result.indexNowNote}</p></div>}
    {result?.indexNow && <p role="status" className="mt-1 text-[11px] text-slate-400">IndexNow: {result.indexNow.status === "submitted" ? "submitted" : result.indexNow.status === "key_file_missing" ? "add the matching key file at your domain root, then retry" : result.indexNow.status === "key_not_configured" ? "add your IndexNow key to this audit first" : result.indexNow.status}</p>}
    {result?.warning && <p className="mt-1 text-[11px] text-amber-300">{result.warning}</p>}
    {result?.error && <p role="alert" className="mt-2 text-xs text-rose-300">{result.error}</p>}
  </div>;
}
