"use client";

import { useState } from "react";
import VerifyFixButton from "@/components/VerifyFixButton";
import CopyRedirects from "@/components/copy-redirects";

type Opportunity = { id: string; audit_id: string | null; domain: string; opportunity_type: string; prompt_query: string; target_url: string; dead_competitor_url: string | null; competitor_domain: string | null; http_status: number | null; matched_user_live_url: string | null; similarity_score: number | null; contact_email_or_link: string | null; outreach_draft: string | null; corrective_schema_json: string | null; verification_status: string; };
type BrokenLink = { id: string; auditId: string; domain: string; cited_url: string; http_status: number; suggested_redirect: string | null };

const tabs = ["Own-Domain 404 & Pricing Recovery", "Competitor 404 Citations to Hijack", "Cited Listicles & Reddit Threads Omitting You"] as const;

function safeContact(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export default function OpportunityCommandCenter({ opportunities, brokenLinks }: { opportunities: Opportunity[]; brokenLinks: BrokenLink[] }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState("");
  async function makeDraft(id: string) {
    setDrafting(id); setError("");
    try {
      const response = await fetch("/api/hijack-pitch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate this pitch.");
      setDraft({ id, text: data.outreachDraft });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate this pitch."); }
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
  return <section id="recovery-command" className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_16px_50px_rgba(0,0,0,.22)] sm:p-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-400">Recovery Operations</p><h2 className="mt-2 text-xl font-semibold text-white">Citation recovery command center</h2></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">{opportunities.length + brokenLinks.length} active signals</span></div>
    <div role="tablist" aria-label="Recovery opportunity categories" className="mt-6 flex gap-2 overflow-x-auto border-b border-white/10 pb-2">
      {tabs.map(item => <button role="tab" aria-selected={tab === item} key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${tab === item ? "bg-emerald-400/15 text-emerald-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{item}</button>)}
    </div>
    {tab === tabs[0] && <div className="mt-5 space-y-3">
      {[...new Set(brokenLinks.map(link => link.domain))].map(domain => <div key={domain}><p className="mb-1 text-xs font-semibold text-slate-400">301 export · {domain}</p><CopyRedirects domain={domain} links={brokenLinks.filter(link => link.domain === domain)} /></div>)}
      {brokenLinks.length ? brokenLinks.map(link => <article key={link.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="break-all text-xs text-rose-300">HTTP {link.http_status} · {link.cited_url}</p><p className="mt-2 break-all text-sm text-slate-300">Suggested canonical: {link.suggested_redirect ?? "No destination matched"}</p>{link.suggested_redirect && <VerifyFixButton auditId={link.auditId} brokenLinkId={link.id} />}</article>) : <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">No saved own-domain 404 links in these audits.</p>}
      {ownPricing.map(item => <article key={item.id} className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"><p className="text-sm font-semibold text-amber-200">Pricing or feature truth mismatch</p><p className="mt-2 break-all text-xs text-slate-300">{item.prompt_query}</p>{item.corrective_schema_json && <details className="mt-3"><summary className="cursor-pointer text-xs text-emerald-300">Entity Pricing JSON-LD Patch</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-[11px] text-slate-300">{item.corrective_schema_json}</pre></details>}</article>)}
    </div>}
    {tab === tabs[1] && <div className="mt-5 space-y-3">{competitor.length ? competitor.map(item => <article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-rose-400/10 px-2.5 py-1 text-[10px] font-semibold text-rose-300">HTTP {item.http_status ?? "unknown"} · {item.competitor_domain}</span>{item.verification_status === "verified_won" && <span className="text-xs font-semibold text-emerald-300">✅ Verified Recovered in AI Search</span>}</div><p className="mt-3 break-all text-xs text-slate-400">AI cited dead URL: {item.dead_competitor_url ?? item.target_url}</p><p className="mt-2 break-all text-sm text-white">Matched live page: {item.matched_user_live_url ?? "No semantic match found"}</p>{typeof item.similarity_score === "number" && <p className="mt-2 text-xs text-emerald-300">pgvector confidence {(item.similarity_score * 100).toFixed(1)}%</p>}<p className="mt-2 text-xs text-slate-500">Buyer prompt: {item.prompt_query}</p><button type="button" onClick={() => void makeDraft(item.id)} disabled={drafting === item.id} className="mt-4 min-h-10 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-[#07110d] disabled:opacity-60">{drafting === item.id ? "Generating…" : "Generate Hijack Pitch"}</button></article>) : <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">No competitor 404 citations recorded.</p>}</div>}
    {tab === tabs[2] && <div className="mt-5 space-y-3">{editorial.length ? editorial.map(item => <article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.opportunity_type === "reddit_citation_thread" ? "bg-orange-400/10 text-orange-300" : "bg-sky-400/10 text-sky-300"}`}>{item.opportunity_type === "reddit_citation_thread" ? "Reddit thread" : item.opportunity_type === "listicle_missing_brand" ? "Brand omitted" : "Outbound 404"}</span><a className="mt-3 block break-all text-sm text-white underline decoration-white/20 underline-offset-4 hover:text-emerald-300" href={item.target_url} target="_blank" rel="noreferrer">{item.target_url}</a><p className="mt-2 text-xs text-slate-400">{item.prompt_query}</p>{safeContact(item.contact_email_or_link) && <a className="mt-3 inline-block text-xs text-emerald-300 hover:underline" href={safeContact(item.contact_email_or_link)!}>{item.contact_email_or_link}</a>}<button type="button" onClick={() => void makeDraft(item.id)} disabled={drafting === item.id} className="ml-3 mt-4 min-h-10 rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-60">{drafting === item.id ? "Generating…" : "Draft Outreach"}</button></article>) : <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">No cited listicle or Reddit gaps recorded.</p>}</div>}
    {error && <p role="status" className="mt-4 text-xs text-amber-300">{error}</p>}
    {draft && <div role="dialog" aria-modal="true" aria-labelledby="pitch-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"><div className="w-full max-w-xl rounded-2xl border border-emerald-400/20 bg-[#0b1112] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><h3 id="pitch-title" className="text-lg font-semibold text-white">Outreach draft</h3><button type="button" onClick={() => setDraft(null)} aria-label="Close draft" className="text-slate-400 hover:text-white">✕</button></div><textarea readOnly value={draft.text} className="mt-4 min-h-48 w-full rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-200" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="rounded-lg px-4 py-2 text-xs text-slate-300">Close</button><button type="button" onClick={() => void copyDraft()} className="rounded-lg bg-emerald-400 px-4 py-2 text-xs font-bold text-[#07110d]">Copy draft</button></div></div></div>}
  </section>;
}
