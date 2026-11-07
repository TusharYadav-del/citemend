"use client";

import { useState } from "react";
import VerifyFixButton from "@/components/VerifyFixButton";
import CopyRedirects from "@/components/copy-redirects";
import RedirectSyncButton from "@/components/redirect-sync-button";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "@/lib/opportunity-lifecycle";
import Link from "next/link";
import { AlertBanner } from "@/components/ui/alert-banner";
import { EmptyState } from "@/components/ui/empty-state";

type Opportunity = { id: string; audit_id: string | null; domain: string; opportunity_type: string; prompt_query: string; target_url: string; dead_competitor_url: string | null; competitor_domain: string | null; http_status: number | null; matched_user_live_url: string | null; similarity_score: number | null; contact_email_or_link: string | null; outreach_draft: string | null; corrective_schema_json: string | null; verification_status: string | null; lifecycle_stage: OpportunityStage; relevance_score: number; buyer_intent_score: number; citation_evidence_score: number; replacement_quality_score: number; composite_priority_score: number; };
type BrokenLink = { id: string; auditId: string; domain: string; cited_url: string; http_status: number; suggested_redirect: string | null };
type ActionLog = { id: string; workspace_domain: string; actor_user_id: string; action_type: string; target_url: string | null; safety_check_passed: boolean; created_at: string };

const tabs = ["Own-Domain 404 & Pricing Recovery", "Replacement Content Opportunities", "Cited Listicles & Reddit Threads Omitting You"] as const;

function LifecycleControls({ item, stage, onAdvanced }: { item: Opportunity; stage: OpportunityStage; onAdvanced: (id: string, stage: OpportunityStage) => void }) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const next = OPPORTUNITY_STAGES[OPPORTUNITY_STAGES.indexOf(stage) + 1];
  async function advance() {
    if (!next) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/opportunities/lifecycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: item.id, stage: next, note }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not update lifecycle stage.");
      onAdvanced(item.id, next); setNote(""); setMessage(`Moved to ${next.replaceAll("_", " ")}.`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not update lifecycle stage."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 border-t border-white/10 pt-3"><div className="flex flex-wrap gap-1" aria-label="Opportunity lifecycle">{OPPORTUNITY_STAGES.map(value => <span key={value} className={`rounded-full px-2 py-1 text-[9px] capitalize ${value === stage ? "bg-emerald-400/15 font-semibold text-emerald-300" : "bg-white/5 text-slate-500"}`}>{value.replaceAll("_", " ")}</span>)}</div><div className="mt-3 flex flex-wrap gap-2"><input aria-label="Stage history note" value={note} onChange={event => setNote(event.target.value)} maxLength={1000} placeholder="Add a short CRM note" className="min-h-9 min-w-48 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-white placeholder:text-slate-600" />{next && <button type="button" disabled={busy} onClick={() => void advance()} className="min-h-9 rounded-lg border border-emerald-400/30 px-3 text-xs font-semibold text-emerald-300 disabled:opacity-50">{busy ? "Saving…" : `Advance to ${next.replaceAll("_", " ")}`}</button>}</div>{message && <p role="status" className="mt-2 text-[11px] text-slate-400">{message}</p>}</div>;
}

function safeContact(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export default function OpportunityCommandCenter({ opportunities, brokenLinks, syncedLinks = [], actionLogs = [] }: { opportunities: Opportunity[]; brokenLinks: BrokenLink[]; syncedLinks?: string[]; actionLogs?: ActionLog[] }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const [lastFailedDraftId, setLastFailedDraftId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<OpportunityStage | "all">("all");
  const [stageOverrides, setStageOverrides] = useState<Record<string, OpportunityStage>>({});
  function stageOf(item: Opportunity): OpportunityStage { return stageOverrides[item.id] ?? item.lifecycle_stage ?? "discovered"; }
  function advanced(id: string, stage: OpportunityStage) { setStageOverrides(previous => ({ ...previous, [id]: stage })); }
  async function makeDraft(id: string) {
    setDrafting(id); setError("");
    try {
      const response = await fetch("/api/hijack-pitch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate this pitch.");
      setDraft({ id, text: data.outreachDraft });
    } catch (cause) { setLastFailedDraftId(id); setError(cause instanceof Error ? cause.message : "Could not generate this pitch."); }
    finally { setDrafting(null); }
  }
  async function copyDraft() {
    if (!draft) return;
    try { await navigator.clipboard.writeText(draft.text); setError("Draft copied to clipboard."); }
    catch { setError("Clipboard access is unavailable."); }
  }
  const ownPricing = opportunities.filter(item => item.opportunity_type === "entity_pricing_mismatch");
  const competitor = opportunities.filter(item => item.opportunity_type === "competitor_direct_404");
  const editorial = opportunities.filter(item => ["listicle_outbound_404", "listicle_missing_brand", "reddit_citation_thread"].includes(item.opportunity_type));
  const visibleCompetitor = competitor.filter(item => stageFilter === "all" || stageOf(item) === stageFilter).sort((a, b) => b.composite_priority_score - a.composite_priority_score);
  const visibleEditorial = editorial.filter(item => stageFilter === "all" || stageOf(item) === stageFilter).sort((a, b) => b.composite_priority_score - a.composite_priority_score);
  if (!opportunities.length && !brokenLinks.length) return <section className="mt-6"><EmptyState title="No opportunities yet" description="Run a buyer prompt audit to find recoverable citations and outreach candidates." action={<Link href="/#audit" className="text-xs font-semibold text-emerald-300">Run an audit</Link>} /></section>;
  return <section id="opportunity-command" className="mt-8 rounded-xl border border-white/[.08] bg-[#0D1119] p-5 shadow-[0_16px_50px_rgba(0,0,0,.22)] sm:p-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-400">Recovery Operations</p><h2 className="mt-2 text-xl font-semibold text-white">Citation recovery command center</h2></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">{opportunities.length + brokenLinks.length} active signals</span></div>
    <div role="tablist" aria-label="Recovery opportunity categories" className="mt-6 flex gap-2 overflow-x-auto border-b border-white/10 pb-2">
      {tabs.map(item => <button role="tab" aria-selected={tab === item} key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${tab === item ? "bg-emerald-400/15 text-emerald-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{item}</button>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2"><label htmlFor="opportunity-stage-filter" className="text-xs text-slate-400">Lifecycle</label><select id="opportunity-stage-filter" value={stageFilter} onChange={event => setStageFilter(event.target.value as OpportunityStage | "all")} className="rounded-lg border border-white/10 bg-[#10151b] px-3 py-2 text-xs text-white"><option value="all">All stages</option>{OPPORTUNITY_STAGES.map(stage => <option key={stage} value={stage}>{stage.replaceAll("_", " ")}</option>)}</select><span className="text-[11px] text-slate-500">Priority is the equal-weight average of relevance, buyer intent, citation evidence, and replacement quality.</span></div>
    {tab === tabs[0] && <div className="mt-5 space-y-3">
      {[...new Set(brokenLinks.map(link => link.domain))].map(domain => <div key={domain}><p className="mb-1 text-xs font-semibold text-slate-400">301 export · {domain}</p><CopyRedirects domain={domain} links={brokenLinks.filter(link => link.domain === domain)} /></div>)}
      {brokenLinks.length ? brokenLinks.map(link => <article key={link.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="break-all text-xs text-rose-300">HTTP {link.http_status} · {link.cited_url}</p><p className="mt-2 break-all text-sm text-slate-300">Suggested canonical: {link.suggested_redirect ?? "No destination matched"}</p>{link.suggested_redirect && <div className="mt-3 flex flex-wrap gap-2"><VerifyFixButton auditId={link.auditId} brokenLinkId={link.id} /><RedirectSyncButton domains={[link.domain]} linkId={link.id} auditId={link.auditId} initiallySynced={syncedLinks.includes(link.id)} /></div>}</article>) : <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">No saved own-domain 404 links in these audits.</p>}
      {ownPricing.map(item => <article key={item.id} className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"><p className="text-sm font-semibold text-amber-200">Pricing or feature truth mismatch</p><p className="mt-2 break-all text-xs text-slate-300">{item.prompt_query}</p>{item.corrective_schema_json && <details className="mt-3"><summary className="cursor-pointer text-xs text-emerald-300">Entity Pricing JSON-LD Patch</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-[11px] text-slate-300">{item.corrective_schema_json}</pre></details>}</article>)}
      <section className="rounded-xl border border-white/10 bg-black/20 p-4"><h3 className="text-sm font-semibold text-white">Redirect safety &amp; action history</h3><p className="mt-1 text-xs text-slate-500">The approval API rechecks each condition against the live destination before saving.</p><div className="mt-3 flex flex-wrap gap-2">{["Open redirect: same canonical hostname required", "Loop: source and redirect chain checked", "Conflict: active source rule checked", "Canonical overwrite: live HTTP 200 source blocked", "Destination: HTTP 200 required"].map(check => <span key={check} className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1 text-[10px] text-emerald-200">{check}</span>)}</div>{actionLogs.length ? <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto">{actionLogs.map(log => <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 p-2 text-xs"><span className="text-slate-300">{log.action_type.replaceAll("_", " ")} · {log.workspace_domain}{log.target_url ? ` · ${log.target_url}` : ""}</span><span className={log.safety_check_passed ? "text-emerald-300" : "text-rose-300"}>{log.safety_check_passed ? "Safety checks passed" : "Safety check blocked"} · {new Date(log.created_at).toLocaleString()}</span></li>)}</ol> : <p className="mt-3 text-xs text-slate-500">No redirect actions have been recorded yet.</p>}</section>
    </div>}
    {tab === tabs[1] && <div className="mt-5 space-y-3"><p className="text-xs leading-5 text-slate-400">When a third-party publisher links to a dead external resource, review a relevant replacement on your site and request a publisher link update. CiteMend cannot redirect a URL you do not control.</p>{visibleCompetitor.length ? visibleCompetitor.map(item => <article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-rose-400/10 px-2.5 py-1 text-[10px] font-semibold text-rose-300">HTTP {item.http_status ?? "unknown"} · {item.competitor_domain}</span>{item.verification_status === "verified_won" && <span className="text-xs font-semibold text-emerald-300">✅ Verified Recovered in AI Search</span>}</div><p className="mt-3 break-all text-xs text-slate-400">Publisher-linked dead external URL: {item.dead_competitor_url ?? item.target_url}</p><p className="mt-2 break-all text-sm text-white">Potential replacement on your site: {item.matched_user_live_url ?? "No semantic match found"}</p>{typeof item.similarity_score === "number" && <p className="mt-2 text-xs text-emerald-300">pgvector relevance ranking score {(item.similarity_score * 100).toFixed(1)}%</p>}<p className="mt-2 text-xs text-slate-500">Buyer prompt: {item.prompt_query}</p><button type="button" onClick={() => void makeDraft(item.id)} disabled={drafting === item.id} className="mt-4 min-h-10 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-[#07110d] disabled:opacity-60">{drafting === item.id ? "Generating…" : "Draft Publisher Outreach"}</button><span className="ml-3 text-xs font-semibold text-amber-200">Priority {item.composite_priority_score}/100</span><LifecycleControls item={item} stage={stageOf(item)} onAdvanced={advanced} /></article>) : <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">No broken-source outreach opportunities recorded.</p>}</div>}
    {tab === tabs[2] && <div className="mt-5 space-y-3">{visibleEditorial.length ? visibleEditorial.map(item => <article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.opportunity_type === "reddit_citation_thread" ? "bg-orange-400/10 text-orange-300" : "bg-sky-400/10 text-sky-300"}`}>{item.opportunity_type === "reddit_citation_thread" ? "Reddit thread" : item.opportunity_type === "listicle_missing_brand" ? "Brand omitted" : "Outbound 404"}</span><a className="mt-3 block break-all text-sm text-white underline decoration-white/20 underline-offset-4 hover:text-emerald-300" href={item.target_url} target="_blank" rel="noreferrer">{item.target_url}</a><p className="mt-2 text-xs text-slate-400">{item.prompt_query}</p>{safeContact(item.contact_email_or_link) && <a className="mt-3 inline-block text-xs text-emerald-300 hover:underline" href={safeContact(item.contact_email_or_link)!}>{item.contact_email_or_link}</a>}<button type="button" onClick={() => void makeDraft(item.id)} disabled={drafting === item.id} className="ml-3 mt-4 min-h-10 rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-60">{drafting === item.id ? "Generating…" : "Draft Outreach"}</button><span className="ml-3 text-xs font-semibold text-amber-200">Priority {item.composite_priority_score}/100</span><LifecycleControls item={item} stage={stageOf(item)} onAdvanced={advanced} /></article>) : <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">No cited listicle or Reddit gaps recorded.</p>}</div>}
    {(tab === tabs[1] || tab === tabs[2]) && <p className="mt-4 text-[11px] leading-5 text-slate-500">Outreach drafts and Reddit replies are prepared for human review. CiteMend never sends emails or posts replies automatically.</p>}
    {error && <div className="mt-4"><AlertBanner tone="warning" title="The action could not finish">{error}{lastFailedDraftId && <button type="button" onClick={() => void makeDraft(lastFailedDraftId)} className="ml-2 font-semibold underline">Retry draft</button>}</AlertBanner></div>}
    {draft && <div role="dialog" aria-modal="true" aria-labelledby="pitch-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"><div className="w-full max-w-xl rounded-2xl border border-emerald-400/20 bg-[#0b1112] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><h3 id="pitch-title" className="text-lg font-semibold text-white">Outreach draft</h3><button type="button" onClick={() => setDraft(null)} aria-label="Close draft" className="text-slate-400 hover:text-white">✕</button></div><textarea readOnly value={draft.text} className="mt-4 min-h-48 w-full rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-200" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="rounded-lg px-4 py-2 text-xs text-slate-300">Close</button><button type="button" onClick={() => void copyDraft()} className="rounded-lg bg-emerald-400 px-4 py-2 text-xs font-bold text-[#07110d]">Copy draft</button></div></div></div>}
  </section>;
}
