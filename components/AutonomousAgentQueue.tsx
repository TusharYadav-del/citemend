"use client";
import { useCallback, useEffect, useState } from "react";
import { AGENT_ACTIONS, riskForAgentAction, type AgentAction } from "@/lib/autonomous-agent";

type RecoveryLink = { id: string; cited_url: string; suggested_redirect: string | null; approval_status: string; http_status: number };
type Opportunity = { id: string; prompt_query: string; opportunity_type: string };
type Run = { id: string; audit_id: string; workspace_domain: string; action_type: AgentAction; risk_level: string; current_step: string; run_status: string; evidence_json: Record<string, unknown>; recommendation_json: Record<string, unknown>; result_json: Record<string, unknown>; stage_history_json: { step: string; at: string; detail?: string }[]; rollback_snapshot_json: unknown; updated_at: string };
type Props = { auditId?: string; domain: string; recoveryLinks: RecoveryLink[]; opportunities: Opportunity[] };
const ACTION_LABELS: Record<AgentAction, string> = {
  capsule_draft: "Generate Citation Capsule draft", jsonld_recommendation: "Recommend JSON-LD schema", forensic_diagnosis: "Prepare forensic diagnosis", llms_txt_preview: "Preview llms.txt",
  entity_baseline_update: "Update entity truth baseline", schedule_reverification: "Schedule re-verification", shopify_301_deploy: "Deploy approved 301 to Shopify", vercel_301_export: "Prepare Vercel 301 deployment", cloudflare_301_export: "Prepare Cloudflare 301 deployment", publisher_outreach_draft: "Prepare publisher outreach draft",
};
const redirectActions = new Set<AgentAction>(["shopify_301_deploy", "vercel_301_export", "cloudflare_301_export"]);
function shortPath(value: string | null) { try { return new URL(value ?? "").pathname; } catch { return "Unknown path"; } }

export default function AutonomousAgentQueue({ auditId, domain, recoveryLinks, opportunities }: Props) {
  const [runs, setRuns] = useState<Run[]>([]); const [quota, setQuota] = useState<{ monthly_scan_quota: number; scans_used_this_month: number } | null>(null);
  const [action, setAction] = useState<AgentAction>("capsule_draft"); const [linkId, setLinkId] = useState(""); const [opportunityId, setOpportunityId] = useState("");
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/agent/runs?domain=${encodeURIComponent(domain)}`, { cache: "no-store" }); const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load the agent queue.");
      setRuns(body.runs ?? []); setQuota((body.policies ?? []).find((item: { workspace_domain: string }) => item.workspace_domain === domain) ?? null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load the agent queue."); }
  }, [domain]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); window.addEventListener("agent-runs-updated", refresh); return () => { window.clearTimeout(timer); window.removeEventListener("agent-runs-updated", refresh); }; }, [refresh]);

  async function send(body: Record<string, unknown>, busyId: string) {
    setBusy(busyId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/agent/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Agent action failed.");
      setNotice(body.operation === "rollback" ? "Saved state restored from its rollback snapshot." : "Agent run updated.");
      await refresh(); window.dispatchEvent(new Event("agent-runs-updated"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Agent action failed."); }
    finally { setBusy(null); }
  }

  const selectedRisk = riskForAgentAction(action);
  const readyToQueue = !!auditId && (!redirectActions.has(action) || !!linkId) && (action !== "publisher_outreach_draft" || !!opportunityId);
  return <section className="mb-6 rounded-2xl border border-white/10 bg-[#0D1119] p-5" aria-label="Autonomous Recovery Agent Queue">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-white">Autonomous Recovery Agent Queue</h2><p className="mt-1 text-xs text-slate-400">Actions are tenant-scoped and quota-limited. External changes and outreach drafts always wait for your approval.</p></div><span className="rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1 text-xs text-cyan-200">{quota ? `${quota.scans_used_this_month}/${quota.monthly_scan_quota} monthly runs` : "Usage policy loads with workspace data"}</span></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label className="text-xs text-slate-400">Agent action<select value={action} onChange={event => setAction(event.target.value as AgentAction)} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101722] px-3 py-2 text-sm text-white">{AGENT_ACTIONS.map(item => <option key={item} value={item}>{ACTION_LABELS[item]}</option>)}</select></label>
      {redirectActions.has(action) ? <label className="text-xs text-slate-400">Approved recovery<select value={linkId} onChange={event => setLinkId(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101722] px-3 py-2 text-sm text-white"><option value="">Choose an approved 404</option>{recoveryLinks.filter(item => item.approval_status === "approved" || item.approval_status === "deployed").map(item => <option key={item.id} value={item.id}>{shortPath(item.cited_url)} → {item.suggested_redirect ? shortPath(item.suggested_redirect) : "No destination"}</option>)}</select></label> : action === "publisher_outreach_draft" ? <label className="text-xs text-slate-400">Publisher opportunity<select value={opportunityId} onChange={event => setOpportunityId(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101722] px-3 py-2 text-sm text-white"><option value="">Choose an opportunity</option>{opportunities.map(item => <option key={item.id} value={item.id}>{item.opportunity_type}: {item.prompt_query}</option>)}</select></label> : <p className="self-end text-xs text-slate-500">Risk permission: <strong className={selectedRisk === "low_risk_auto" ? "text-emerald-300" : selectedRisk === "medium_risk_review" ? "text-amber-300" : "text-rose-300"}>{selectedRisk.replaceAll("_", " ")}</strong></p>}
      <button type="button" disabled={!readyToQueue || !!busy} onClick={() => { if (selectedRisk !== "low_risk_auto" && !window.confirm(`Queue ${ACTION_LABELS[action]} for explicit human review? It will not execute until approved.`)) return; void send({ operation: "start", actionType: action, auditId, linkId: redirectActions.has(action) ? linkId : undefined, opportunityId: action === "publisher_outreach_draft" ? opportunityId : undefined, confirmationRequired: selectedRisk !== "low_risk_auto" }, "start"); }} className="self-end rounded-lg bg-emerald-300 px-4 py-2.5 text-xs font-bold text-[#07110d] disabled:opacity-40">Queue Agent Run</button>
    </div>
    {error && <p className="mt-3 text-xs text-rose-300" role="alert">{error}</p>}{notice && <p className="mt-3 text-xs text-emerald-300" role="status">{notice}</p>}
    {!runs.length ? <p className="mt-5 rounded-lg border border-white/5 bg-white/[.02] p-4 text-xs text-slate-500">No agent runs for this workspace yet.</p> : <ul className="mt-5 space-y-3">{runs.map(run => <li key={run.id} className="rounded-xl border border-white/10 bg-white/[.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">{ACTION_LABELS[run.action_type] ?? run.action_type}</h3><p className="mt-1 text-[11px] text-slate-500">Run {run.id.slice(0, 8)} · {new Date(run.updated_at).toLocaleString()}</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] capitalize text-slate-300">{run.current_step.replaceAll("_", " ")}</span><span className={`rounded-full border px-2.5 py-1 text-[10px] ${run.risk_level === "low_risk_auto" ? "border-emerald-300/20 text-emerald-200" : run.risk_level === "medium_risk_review" ? "border-amber-300/20 text-amber-200" : "border-rose-300/20 text-rose-200"}`}>{run.risk_level.replaceAll("_", " ")}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-400">{run.run_status.replaceAll("_", " ")}</span></div></div>
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Seven-stage agent progress">{["Discover", "Investigate", "Recommend", "Request Approval", "Execute", "Verify", "Rollback"].map(step => <span key={step} className={`rounded px-2 py-1 text-[9px] ${run.stage_history_json?.some(entry => entry.step === step.toLowerCase().replaceAll(" ", "_")) ? "bg-emerald-300/10 text-emerald-200" : "bg-white/[.035] text-slate-600"}`}>{step}</span>)}</div>
      <div className="mt-3 flex flex-wrap items-center gap-3"><a href={`/audit/${run.audit_id}`} className="text-xs text-cyan-300 hover:underline">Open traceable audit evidence ↗</a><span className="text-[10px] text-slate-500">{String((run.evidence_json as Record<string, unknown>)?.buyerPrompt ?? "Evidence linked to owned audit")}</span></div>
      {run.run_status === "awaiting_approval" && <button type="button" disabled={!!busy} onClick={() => { if (!window.confirm("Approve this action and authorize the agent to execute it? Redirect deployments will repeat all safety checks.")) return; void send({ operation: "approve_execute", runId: run.id, humanApproval: true }, run.id); }} className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50">Approve &amp; Execute</button>}
      {(run.current_step === "verify" || run.current_step === "execute" && run.run_status === "failed") && Boolean(run.rollback_snapshot_json) && run.run_status !== "rolled_back" && <button type="button" disabled={!!busy} onClick={() => { if (!window.confirm("Restore this run's saved previous state?")) return; void send({ operation: "rollback", runId: run.id }, run.id); }} className="ml-2 mt-3 rounded-lg border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-xs font-semibold text-rose-100 disabled:opacity-50">1-Click Rollback</button>}
      {run.result_json && Object.keys(run.result_json).length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs text-slate-400">View generated result / deployment preview</summary><pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/30 p-3 text-[10px] leading-5 text-slate-300">{JSON.stringify(run.result_json, null, 2)}</pre></details>}
    </li>)}</ul>}
  </section>;
}
