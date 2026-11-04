"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { linkId: string; suggestedRedirect: string | null; approvalStatus: string; confidence: number | null; evidence: string | null };

export function RecoveryApprovalControls({ linkId, suggestedRedirect, approvalStatus, confidence, evidence }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewed, setPreviewed] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [manualDestination, setManualDestination] = useState(suggestedRedirect ?? "");
  const manualMapping = confidence !== null && confidence < 70 || !suggestedRedirect;
  const needsReview = manualMapping || confidence === null || confidence < 85;

  async function send(url: string, payload: object) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The recovery request failed.");
    return result;
  }

  async function preview() {
    setBusy(true); setMessage("");
    try {
      const result = await send("/api/recovery/approve", { linkId, action: "preview", ...(manualMapping ? { destinationUrl: manualDestination } : {}) });
      const data = result.preview as { state: string; httpStatus: number; similarityScore: number | null; previewToken: string };
      setPreviewed(true);
      setPreviewToken(data.previewToken);
      setMessage(`Preview verified HTTP ${data.httpStatus}. ${data.similarityScore === null ? "No semantic similarity score; manual review required." : `Cosine similarity ranking signal: ${Math.round(data.similarityScore * 100)}% (not a probability).`}`);
    } catch (error) { setPreviewed(false); setPreviewToken(null); setMessage(error instanceof Error ? error.message : "Preview failed."); }
    finally { setBusy(false); }
  }

  async function approve() {
    setBusy(true); setMessage("");
    try {
      await send("/api/recovery/approve", { linkId, action: "approve", reviewConfirmed: needsReview && previewed, ...(needsReview && previewToken ? { previewToken } : {}), ...(manualMapping ? { destinationUrl: manualDestination } : {}) });
      setMessage("Approved. The interceptor and sync exporter can now use this redirect.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Approval failed."); }
    finally { setBusy(false); }
  }

  async function rollback() {
    setBusy(true); setMessage("");
    try {
      const result = await send("/api/recovery/rollback", { linkId });
      setMessage(result.restoredDestination ? `Rolled back to ${String(result.restoredDestination)}.` : "Redirect rolled back and disabled.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Rollback failed."); }
    finally { setBusy(false); }
  }

  return <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
    <p className="text-xs text-slate-300">Review state: <span className="font-medium text-white">{approvalStatus.replaceAll("_", " ")}</span>{confidence !== null && <span className="ml-2 text-slate-400">Similarity ranking signal {confidence}%</span>}</p>
    {manualMapping && <><label htmlFor={`manual-destination-${linkId}`} className="mt-2 block text-xs text-amber-200">Manual mapping required. Similarity is not a probability; scores below 70 are never used for automatic recovery. Enter a destination to preview.</label><input id={`manual-destination-${linkId}`} type="url" value={manualDestination} onChange={event => { setManualDestination(event.target.value); setPreviewed(false); setPreviewToken(null); }} placeholder="https://yourdomain.com/canonical-page" className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-slate-500" />{evidence && <p className="mt-1 text-xs text-slate-500">{evidence}</p>}</>}
    {approvalStatus === "pending_review" || approvalStatus === "rejected" || approvalStatus === "rolled_back" ? <div className="mt-2 flex flex-wrap gap-2">
      {(manualMapping || needsReview) && <button type="button" disabled={busy || (manualMapping && !manualDestination.trim())} onClick={preview} className="rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-white/5 disabled:opacity-50">{manualMapping ? "Preview manual destination" : "Preview destination"}</button>}
      <button type="button" disabled={busy || (needsReview && (!previewed || !previewToken))} onClick={approve} className="rounded-md bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{manualMapping ? "Confirm manual mapping & approve" : needsReview ? "Confirm review & approve" : "Approve verified destination"}</button>
    </div> : null}
    {(approvalStatus === "approved" || approvalStatus === "deployed") && <button type="button" disabled={busy} onClick={rollback} className="mt-2 rounded-md border border-rose-300/25 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-400/10 disabled:opacity-50">Roll back redirect</button>}
    {message && <p role="status" className="mt-2 break-all text-xs text-slate-300">{message}</p>}
  </div>;
}
