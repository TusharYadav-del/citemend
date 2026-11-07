"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, RotateCw, X } from "lucide-react";
import { RecoveryApprovalControls } from "@/components/RecoveryApprovalControls";
import PublishRedirect from "@/components/publish-redirect";
import RedirectSyncButton from "@/components/redirect-sync-button";
import { AlertBanner } from "@/components/ui/alert-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { CitationEvidenceImport } from "@/components/citation-evidence-import";
import { EvidenceCategoryBadge } from "@/components/evidence-category-badge";
import type { UserAuditHistoryItem } from "@/lib/audit-history";

export type RecoveryRow = UserAuditHistoryItem["broken_links"][number] & { auditId: string; domain: string; auditCreatedAt: string };
export type RecoveryEvidence = { id: string; audit_id: string; domain: string; prompt_query: string; prompt_version: string; provider: string; model_name: string; search_method: string; locale: string; raw_answer: string; extracted_urls_json: string[]; sample_size: number; observed_at: string };
export type RecoveryOutcome = { audit_id: string; broken_link_id: string | null; technical_deployment_verified_at: string | null; ai_citation_observed_at: string | null };
export type RecoveryLog = { id: string; workspace_domain: string; action_type: string; target_url: string | null; safety_check_passed: boolean; created_at: string };

function stateLabel(row: RecoveryRow) {
  if (row.url_state === "hallucinated") return "hallucinated";
  if (["404", "410", "301", "200", "blocked", "timeout", "unknown"].includes(row.url_state)) return row.url_state;
  if ([200, 301, 404, 410].includes(row.http_status)) return String(row.http_status);
  return "unknown";
}
function sourceKey(value: string) {
  try { const url = new URL(value); return `${url.hostname.toLowerCase()}:${url.pathname}`; }
  catch { return null; }
}
function safeDestination(value: string | null) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" ? url.href : null; }
  catch { return null; }
}
const dateLabel = (value: string) => new Date(value).toLocaleString();

export function RecoveryCenter({ rows, evidence, outcomes, logs, canApprove, isPro, activeRules, syncedLinks, pendingOnly = false, evidenceError = false, destinationRequestsServed = {}, auditId, workspaceDomain }: {
  rows: RecoveryRow[]; evidence: RecoveryEvidence[]; outcomes: RecoveryOutcome[]; logs: RecoveryLog[];
  canApprove: boolean; isPro: boolean | null; activeRules: string[]; syncedLinks: string[]; pendingOnly?: boolean; evidenceError?: boolean; destinationRequestsServed?: Record<string, number>; auditId?: string; workspaceDomain?: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visible = pendingOnly ? rows.filter(row => row.approval_status === "pending_review" || row.approval_status === "rejected") : rows;
  const selected = visible.find(row => row.id === selectedId) ?? null;
  const observation = selected ? evidence.find(item => item.audit_id === selected.auditId && item.extracted_urls_json.includes(selected.cited_url)) ?? evidence.find(item => item.audit_id === selected.auditId) : null;
  const outcome = selected ? outcomes.find(item => item.audit_id === selected.auditId && item.broken_link_id === selected.id) : null;
  const history = selected ? logs.filter(item => item.workspace_domain === selected.domain && (item.target_url === selected.suggested_redirect || item.target_url === selected.cited_url)) : [];
  const currentKey = selected ? sourceKey(selected.cited_url) : null;
  const readyToDeploy = selected && ["approved", "deployed"].includes(selected.approval_status) && selected.suggested_redirect && currentKey;
  return <section id="recovery-command" aria-labelledby="recovery-title" className="mb-6 scroll-mt-8 rounded-xl border border-white/[.08] bg-[#0D1119]">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[.08] p-5"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-emerald-300">1 · Defend</p><h2 id="recovery-title" className="mt-1 text-xl font-semibold text-white">Recovery Center</h2><p className="mt-1 text-xs text-slate-400">Inspect cited destinations and review each recovery before deployment.</p></div><span className="rounded-lg border border-white/10 px-3 py-2 font-mono text-xs tabular-nums text-slate-300">{visible.length} URLs</span></div>
    <div className="border-b border-white/[.08] p-4"><CitationEvidenceImport auditId={auditId} domain={workspaceDomain} /></div>    {evidenceError && <div className="border-b border-white/[.08] p-4"><AlertBanner tone="warning" title="Some evidence is unavailable">The URL list is available. Reload to retry its observation and outcome details. <button type="button" onClick={() => router.refresh()} className="ml-2 inline-flex items-center gap-1 font-semibold underline"><RotateCw className="size-3.5" />Retry</button></AlertBanner></div>}
    {visible.length === 0 ? <div className="p-5"><EmptyState title={pendingOnly ? "No URLs awaiting review" : "No broken citations yet"} description={pendingOnly ? "There are no pending redirect approvals in this workspace." : "Run a buyer prompt audit to check citations and find recoverable URLs."} action={<Link href="/#audit" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">Run an audit <ArrowRight className="size-3.5" /></Link>} /></div> : <div className={`grid grid-cols-12 ${selected ? "xl:divide-x xl:divide-white/[.08]" : ""}`}>
      <div className={`col-span-12 min-w-0 overflow-x-auto ${selected ? "xl:col-span-8" : ""}`}><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-white/[.025] text-[10px] uppercase tracking-[.12em] text-slate-500"><tr><th scope="col" className="px-4 py-3 font-medium">Cited URL</th><th scope="col" className="px-4 py-3 font-medium">State</th><th scope="col" className="px-4 py-3 font-medium">Suggested destination</th><th scope="col" className="px-4 py-3 font-medium">Review</th></tr></thead><tbody>{visible.map(row => <tr key={row.id} className={`border-t border-white/[.06] ${selectedId === row.id ? "bg-emerald-300/[.055]" : "hover:bg-white/[.025]"}`}><td className="max-w-[16rem] px-4 py-3"><button type="button" onClick={() => setSelectedId(row.id)} aria-label={`Inspect ${row.cited_url}`} className="block max-w-full truncate font-mono text-[11px] text-emerald-200 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-300">{row.cited_url}</button><span className="font-mono text-[10px] text-slate-500">{row.domain}</span></td><td className="px-4 py-3"><span className="rounded-md border border-rose-300/20 bg-rose-300/[.055] px-2 py-1 font-mono text-[10px] text-rose-200">{stateLabel(row)}</span></td><td className="max-w-[16rem] truncate px-4 py-3 font-mono text-[10px] text-slate-400">{row.suggested_redirect ?? "Manual mapping needed"}</td><td className="px-4 py-3 font-mono text-[10px] text-slate-300">{row.approval_status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>
      {selected && <aside aria-label="Recovery inspector" className="fixed inset-0 z-50 overflow-y-auto border-l border-white/[.08] bg-[#101722] p-5 shadow-2xl sm:left-auto sm:w-[min(31rem,90vw)] xl:sticky xl:top-0 xl:col-span-4 xl:max-h-[90vh] xl:w-auto xl:border-l-0 xl:shadow-none"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-emerald-300">Context view · Inspector</p><h3 className="mt-1 text-base font-semibold text-white">Detected problem</h3></div><button type="button" onClick={() => setSelectedId(null)} aria-label="Close recovery inspector" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="size-4" /></button></div>
        <div className="mt-4 space-y-5 text-xs">
          <section><p className="break-all font-mono text-[11px] text-slate-200">{selected.cited_url}</p><div className="mt-2 flex flex-wrap gap-2"><span className="rounded-md border border-rose-300/20 px-2 py-1 font-mono text-rose-200">{stateLabel(selected)}</span><span className="rounded-md border border-white/10 px-2 py-1 font-mono text-slate-300">HTTP {selected.http_status || "unknown"}</span><EvidenceCategoryBadge category="http" /></div></section>
          <section className="rounded-lg border border-white/[.08] bg-black/15 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-white">Reproducible AI observation</h4><EvidenceCategoryBadge category="observation" /></div>{observation ? <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div className="col-span-2"><dt className="text-slate-500">Raw answer excerpt</dt><dd className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-slate-200">{observation.raw_answer.slice(0, 450)}{observation.raw_answer.length > 450 ? "…" : ""}</dd></div>{[["Prompt", observation.prompt_query], ["Prompt version", observation.prompt_version], ["Provider", observation.provider], ["Model", observation.model_name], ["Search method", observation.search_method], ["Locale", observation.locale], ["Observed", dateLabel(observation.observed_at)], ["Sample size", `n = ${observation.sample_size} runs`]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 break-words font-mono text-slate-200">{value}</dd></div>)}{observation.sample_size < 5 && <p className="col-span-2 text-amber-200">Low sample size: fewer than five observations. Treat changes as directional.</p>}</dl> : <p className="mt-2 text-slate-400">No reproducible observation is saved for this audit.</p>}</section>
          <section className="rounded-lg border border-white/[.08] bg-black/15 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-white">Semantic destination match</h4><EvidenceCategoryBadge category="estimate" /></div><p className="mt-2 break-all font-mono text-[11px] text-emerald-200">{selected.suggested_redirect ?? "No verified destination mapped"}</p><p className="mt-2 text-slate-400">{selected.match_confidence === null ? "No similarity score." : `Similarity ranking signal: ${selected.match_confidence}% (not a probability).`}</p><p className="mt-1 text-slate-500">{selected.match_evidence_reason ?? "Review the destination against the cited page intent."}</p></section>
          <section className="rounded-lg border border-white/[.08] bg-black/15 p-3"><h4 className="font-semibold text-white">Human approval & deployment</h4>{canApprove && selected.http_status === 404 ? <><RecoveryApprovalControls key={selected.id} linkId={selected.id} suggestedRedirect={selected.suggested_redirect} approvalStatus={selected.approval_status} approvedBy={selected.approved_by} confidence={selected.match_confidence} evidence={selected.match_evidence_reason} />{readyToDeploy && <div className="mt-3 space-y-2"><PublishRedirect linkId={selected.id} initiallyActive={activeRules.includes(currentKey!)} isPro={isPro} /><RedirectSyncButton domains={[selected.domain]} linkId={selected.id} auditId={selected.auditId} initiallySynced={syncedLinks.includes(selected.id)} /></div>}</> : <div className="mt-2"><p className="text-slate-400">{canApprove ? "Approval is available after a confirmed HTTP 404 and a verified destination preview." : "Workspace admin access is required to approve or roll back a redirect."}</p><ul className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-[11px] text-slate-400">{["Same host · no open redirect", "No redirect loop", "No live 200 canonical overwrite", "Destination HTTP 200 verified"].map(check => <li key={check} className="flex justify-between gap-2"><span>{check}</span><span className="font-mono text-amber-200">NOT CHECKED</span></li>)}</ul></div>}{safeDestination(selected.suggested_redirect) && <a href={safeDestination(selected.suggested_redirect)!} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-emerald-300 hover:underline">Open destination page <ExternalLink className="size-3" /></a>}</section>
                    <section className="rounded-lg border border-white/[.08] bg-black/15 p-3"><h4 className="font-semibold text-white">Recovery verification milestones</h4><div className="mt-3 grid gap-2">{[
            ["Redirect Deployed", selected.deployed_at ? `recorded ${dateLabel(selected.deployed_at)}` : "not recorded"],
            ["Destination HTTP 200 Verified", outcome?.technical_deployment_verified_at ? `verified ${dateLabel(outcome.technical_deployment_verified_at)}` : "not verified"],
            ["Destination Requests Served", `${destinationRequestsServed[selected.id] ?? 0} measured edge requests (may include simulations)`],
            ["Later Answer Observation Changed", outcome?.ai_citation_observed_at ? `observed ${dateLabel(outcome.ai_citation_observed_at)}` : "not observed"],
          ].map(([label, value]) => <p key={label} className="rounded-md border border-white/[.08] px-2 py-1.5 text-slate-300">{label}: <strong className="font-mono text-white">{value}</strong></p>)}</div></section>
          <section className="rounded-lg border border-white/[.08] bg-black/15 p-3"><h4 className="font-semibold text-white">Your immutable action history</h4>{history.length ? <ol className="mt-2 space-y-2">{history.slice(0, 8).map(item => <li key={item.id} className="border-l border-white/15 pl-3"><p className="font-medium text-slate-200">{item.action_type.replaceAll("_", " ")}</p><p className="font-mono text-[10px] text-slate-500">{dateLabel(item.created_at)} · safety {item.safety_check_passed ? "passed" : "rejected"}</p></li>)}</ol> : <p className="mt-2 text-slate-400">No actions by you are recorded for this destination.</p>}</section>
        </div>
      </aside>}
    </div>}
  </section>;
}
