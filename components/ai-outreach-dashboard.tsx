"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DELIVERABILITY_CHECKS, EMPTY_DELIVERABILITY_CHECKLIST, isDeliverabilityReady, isReviewableOneExample, type DeliverabilityChecklist } from "@/lib/outreach/workbench";

type VerifiedExample = {
  deadUrl: string;
  status: 404 | 410;
  detectedAt: string;
  referrerUrl: string;
  referrerContext: string;
  replacementUrl: string | null;
  replacementReason: string | null;
};
type Data = {
  settings: {
    outreach_enabled: boolean;
    kill_switch: boolean;
    daily_target: number;
    daily_send_limit: number;
    min_qualification_score: number;
    deliverability_domain: string | null;
    deliverability_checklist: DeliverabilityChecklist;
    deliverability_checked_at: string | null;
  };
  outboundEmailsEnabled: boolean;
  prospects: { id: string; domain: string; company_name: string | null; qualification_score: number; status: string }[];
  emails: { id: string; recipient: string; subject: string; status: string; body_text: string; factuality_report: { passed?: boolean; approvalStatus?: string; claims?: VerifiedExample[]; founderReview?: { decision?: string; reviewedAt?: string } }; founder_review_decision: "approved" | "rejected" | null; founder_reviewed_at: string | null }[];
  runs: { id: string; run_date: string; status: string; discovered: number; emails_sent: number; errors: number }[];
  suppressions: { id: string; email: string; domain: string | null; reason: string; source: string; created_at: string }[];
  replies: { id: string; email_id: string | null; payload: Record<string, unknown>; occurred_at: string }[];
};

export default function AiOutreachDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [deliverabilityDomain, setDeliverabilityDomain] = useState("");
  const [checklist, setChecklist] = useState<DeliverabilityChecklist>(EMPTY_DELIVERABILITY_CHECKLIST);
  const [suppressionEmail, setSuppressionEmail] = useState("");
  const [suppressionFilter, setSuppressionFilter] = useState("");

  const acceptData = useCallback((result: Data) => {
    setData(result);
    setDeliverabilityDomain(result.settings.deliverability_domain ?? "");
    setChecklist(result.settings.deliverability_checklist ?? EMPTY_DELIVERABILITY_CHECKLIST);
    setError("");
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/outreach", { cache: "no-store" });
      const result = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load outreach data.");
      acceptData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load outreach data.");
    }
  }, [acceptData]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/outreach", { cache: "no-store" }).then(async response => {
      const result = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load outreach data.");
      if (active) acceptData(result);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load outreach data.");
    });
    return () => { active = false; };
  }, [acceptData]);

  async function change(body: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(true); setNote(""); setError("");
    try {
      const response = await fetch("/api/admin/outreach", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Update failed.");
      setNote(success);
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed.");
      return false;
    } finally { setBusy(false); }
  }

  const readinessComplete = !!data?.settings.deliverability_domain && isDeliverabilityReady(checklist);
  const suppressionSet = useMemo(() => new Set(data?.suppressions.map(item => item.email.toLowerCase()) ?? []), [data?.suppressions]);
  const visibleSuppressions = data?.suppressions.filter(item => `${item.email} ${item.domain ?? ""} ${item.reason} ${item.source}`.toLowerCase().includes(suppressionFilter.toLowerCase())) ?? [];

  if (error && !data) return <main className="mx-auto max-w-6xl p-8 text-white"><h1 className="text-3xl font-semibold">AI Outreach</h1><p className="mt-4 rounded-lg border border-amber-300/20 p-4 text-amber-200">{error}</p><button type="button" onClick={() => void refresh()} className="mt-4 rounded border border-white/20 px-4 py-2">Retry</button></main>;
  if (!data) return <main className="p-8 text-slate-300">Loading AI Outreach…</main>;

  const sections = ["Outreach Overview", "Prospect Pipeline & Citation Evidence", "Email Preview & Factuality Report", "Deliverability Checklist", "Sending Activity & Replies", "Suppression & Opt-Out Ledger", "Automation Settings"];
  return <main className="mx-auto max-w-6xl space-y-8 p-5 text-slate-100 sm:p-8">
    <header><p className="font-mono text-xs uppercase tracking-[.2em] text-emerald-300">Founder controls</p><h1 className="mt-2 text-3xl font-semibold">AI Outreach Workbench</h1><p className="mt-2 text-sm text-slate-400">Inspect one verified dead-URL example, review the email draft, check sending-domain readiness, and maintain the suppression ledger. No action on this page sends an email.</p><nav className="mt-5 flex flex-wrap gap-2">{sections.map(section => <a key={section} href={`#${section.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs">{section}</a>)}</nav></header>

    {!data.outboundEmailsEnabled && <section role="status" className="rounded-xl border border-amber-300/30 bg-amber-300/[.06] p-5"><h2 className="text-base font-semibold text-amber-100">Outbound prospect email lock is active</h2><p className="mt-2 text-sm leading-6 text-amber-50/80">The server will not send prospect email while <code>OUTBOUND_EMAILS_ENABLED</code> is unset or not exactly <code>true</code>. Founder approval remains disabled. Draft preview, rejection, deliverability preparation, and opt-outs remain available. Unlocking a draft never sends it.</p></section>}
    {data.outboundEmailsEnabled && <section role="status" className="rounded-xl border border-emerald-300/25 bg-emerald-300/[.05] p-5"><h2 className="text-base font-semibold text-emerald-100">Outbound environment gate is enabled</h2><p className="mt-2 text-sm leading-6 text-emerald-50/80">Each draft still needs explicit founder review and a complete deliverability checklist. Approval only changes draft state; this workbench has no send action.</p></section>}
    {error && <p role="alert" className="rounded-lg border border-red-300/20 p-3 text-sm text-red-100">{error}</p>}
    {note && <p role="status" className="rounded-lg border border-emerald-300/20 p-3 text-sm text-emerald-100">{note}</p>}

    <section id="outreach-overview" className="grid gap-3 sm:grid-cols-4">{[["Prospects", data.prospects.length], ["Qualified", data.prospects.filter(item => item.status === "qualified").length], ["Locked drafts", data.emails.filter(item => item.status === "draft_locked").length], ["Suppressed / opted out", data.suppressions.length]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</section>

    <section id="prospect-pipeline-citation-evidence" className="rounded-xl border border-white/10 p-5"><h2 className="text-xl font-semibold">Prospect Pipeline &amp; Citation Evidence</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-slate-400"><th className="p-2">Company</th><th className="p-2">Domain</th><th className="p-2">Score</th><th className="p-2">Status</th><th className="p-2">Report</th></tr></thead><tbody>{data.prospects.map(item => <tr key={item.id} className="border-t border-white/5"><td className="p-2">{item.company_name}</td><td className="p-2">{item.domain}</td><td className="p-2">{item.qualification_score}/100</td><td className="p-2">{item.status}</td><td className="p-2"><a className="text-emerald-300 underline" href={`/report/${encodeURIComponent(item.domain)}`} target="_blank" rel="noreferrer">Open report</a></td></tr>)}</tbody></table></div></section>

    <section id="email-preview-factuality-report" className="rounded-xl border border-white/10 p-5"><h2 className="text-xl font-semibold">Email Preview &amp; Founder Review</h2><p className="mt-2 text-sm text-slate-400">Preview is limited to the verified example saved with each draft. Approval requires the environment unlock, all deliverability checks, an unsuppressed address, and exactly one factuality-checked 404/410 example.</p><div className="mt-4 space-y-3">{data.emails.length ? data.emails.map(email => {
      const suppressed = suppressionSet.has(email.recipient.toLowerCase());
      const canReview = email.status === "draft_locked" && !email.founder_review_decision;
      const canApprove = canReview && data.outboundEmailsEnabled && readinessComplete && !suppressed && isReviewableOneExample(email.factuality_report);
      return <details key={email.id} className="rounded-lg bg-white/[.03] p-3 text-sm"><summary className="cursor-pointer"><b>{email.subject}</b><span className="ml-3 text-xs text-slate-400">{email.status} · {email.recipient}</span>{email.founder_review_decision && <span className="ml-2 text-xs text-emerald-200">Founder {email.founder_review_decision}</span>}</summary>
        <pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-300">{email.body_text}</pre>
        <p className="mt-3 text-xs font-semibold">Factuality report: {email.factuality_report.passed ? "passed" : "not passed"} · {email.factuality_report.approvalStatus ?? "founder review required"}</p>
        {email.factuality_report.claims?.map((example, index) => <dl key={`${email.id}-${index}`} className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2"><div><dt className="font-semibold">Verified dead URL · HTTP {example.status}</dt><dd className="break-all"><a className="text-emerald-300 underline" href={example.deadUrl} target="_blank" rel="noreferrer">{example.deadUrl}</a></dd></div><div><dt className="font-semibold">Detection date</dt><dd>{new Date(example.detectedAt).toISOString().slice(0, 10)}</dd></div><div><dt className="font-semibold">Citation / referrer</dt><dd className="break-all"><a className="text-emerald-300 underline" href={example.referrerUrl} target="_blank" rel="noreferrer">{example.referrerUrl}</a> · {example.referrerContext}</dd></div><div><dt className="font-semibold">Suggested live replacement</dt><dd className="break-all">{example.replacementUrl ?? "No replacement verified; no email generated."}{example.replacementReason && <p className="mt-1">{example.replacementReason}</p>}</dd></div></dl>)}
        {canReview && <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || !canApprove} onClick={() => void change({ action: "review_draft", emailId: email.id, decision: "approved" }, "Draft approved for manual use. No email was sent.")} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-[#07110d] disabled:cursor-not-allowed disabled:opacity-40">Approve draft</button><button type="button" disabled={busy} onClick={() => void change({ action: "review_draft", emailId: email.id, decision: "rejected" }, "Draft rejected. No email was sent.")} className="rounded-lg border border-red-300/30 px-3 py-2 text-xs text-red-100 disabled:opacity-50">Reject draft</button><button type="button" disabled={busy} onClick={() => { setSuppressionEmail(email.recipient); document.getElementById("suppression-email")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200">Add recipient to suppression ledger</button><p className="basis-full text-[11px] text-slate-500">{suppressed ? "Recipient is suppressed." : !data.outboundEmailsEnabled ? "Approval is locked by the server environment." : !readinessComplete ? "Save a sending domain and complete every deliverability check before approval." : !isReviewableOneExample(email.factuality_report) ? "This draft does not pass the one-example factuality gate." : "Approval records a review decision only. Sending is not available here."}</p></div>}
      </details>;
    }) : <p className="rounded-lg bg-white/[.03] p-4 text-sm text-slate-400">No outreach drafts have been generated. When available, each draft remains a founder-reviewed preview.</p>}</div></section>

    <section id="deliverability-checklist" className="rounded-xl border border-white/10 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Sending-Domain Deliverability Checklist</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Manual readiness record only. CiteMend does not query DNS or verify provider dashboards from this checklist.</p></div><span className={`rounded-full px-3 py-1 text-xs ${readinessComplete ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-100"}`}>{readinessComplete ? "All checks marked complete" : `${DELIVERABILITY_CHECKS.filter(item => checklist[item.key]).length}/${DELIVERABILITY_CHECKS.length} complete`}</span></div>
      <label className="mt-4 block max-w-md text-xs text-slate-300">Sending domain<input value={deliverabilityDomain} onChange={event => setDeliverabilityDomain(event.target.value)} maxLength={253} placeholder="mail.example.com" autoComplete="off" className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{DELIVERABILITY_CHECKS.map(item => <label key={item.key} className="flex items-start gap-3 rounded-lg border border-white/[.06] bg-white/[.02] p-3 text-xs leading-5 text-slate-300"><input type="checkbox" checked={checklist[item.key]} onChange={event => setChecklist(current => ({ ...current, [item.key]: event.target.checked }))} className="mt-0.5 size-4 accent-emerald-300" />{item.label}</label>)}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={busy || !deliverabilityDomain.trim()} onClick={() => void change({ action: "save_deliverability", domain: deliverabilityDomain, checklist }, "Deliverability checklist saved.")} className="rounded-lg bg-emerald-300 px-4 py-2 text-xs font-semibold text-[#07110d] disabled:opacity-50">Save checklist</button>{data.settings.deliverability_domain && <span className="text-xs text-slate-500">Saved domain: {data.settings.deliverability_domain}</span>}{data.settings.deliverability_checked_at && <span className="text-xs text-slate-500">Last saved {new Date(data.settings.deliverability_checked_at).toLocaleString()}</span>}</div>
    </section>

    <section id="sending-activity-replies" className="rounded-xl border border-white/10 p-5"><h2 className="text-xl font-semibold">Sending Activity &amp; Replies</h2><p className="mt-2 text-xs text-slate-500">This workbench does not send prospect messages. Historical delivery events are shown for audit only.</p><div className="mt-4 space-y-2">{data.runs.map(run => <div key={run.id} className="rounded-lg bg-white/[.03] p-3 text-sm">{run.run_date} · {run.status} · {run.discovered} discovered · {run.emails_sent} sent · {run.errors} errors</div>)}</div><h3 className="mt-5 text-sm font-semibold">Received replies</h3>{data.replies.length ? data.replies.map(reply => <div key={reply.id} className="mt-2 rounded-lg bg-white/[.03] p-3 text-sm">{String(reply.payload.from ?? "Contact")} · {new Date(reply.occurred_at).toLocaleString()}<p className="mt-1 text-xs text-slate-400">{String(reply.payload.excerpt ?? "Reply recorded")}</p></div>) : <p className="mt-2 text-sm text-slate-400">No replies recorded. Connect your inbound mail workflow to the signed reply endpoint.</p>}</section>

    <section id="suppression-opt-out-ledger" className="rounded-xl border border-white/10 p-5"><h2 className="text-xl font-semibold">Suppression &amp; Opt-Out Ledger</h2><p className="mt-2 text-sm text-slate-400">Manual suppression is permanent in the outreach workflow. Unsubscribes and provider bounce/complaint events also appear here.</p><form className="mt-4 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); if (suppressionEmail.trim()) void change({ action: "add_suppression", email: suppressionEmail }, "Address added to the suppression ledger; any unsent drafts were disabled.").then(saved => { if (saved) setSuppressionEmail(""); }); }}><label className="sr-only" htmlFor="suppression-email">Email to suppress</label><input id="suppression-email" type="email" required value={suppressionEmail} onChange={event => setSuppressionEmail(event.target.value)} placeholder="person@example.com" className="min-h-10 min-w-64 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white" /><button type="submit" disabled={busy} className="min-h-10 rounded-lg border border-red-300/30 px-4 text-xs font-semibold text-red-100 disabled:opacity-50">Add suppression</button></form>
      <label className="mt-4 block max-w-sm text-xs text-slate-300">Filter ledger<input value={suppressionFilter} onChange={event => setSuppressionFilter(event.target.value)} placeholder="Email, domain, reason or source" className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
      <div className="mt-4 space-y-2">{visibleSuppressions.length ? visibleSuppressions.map(item => <div key={item.id} className="grid gap-1 rounded-lg bg-white/[.03] p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"><span className="break-all">{item.email}</span><span className="text-xs text-slate-400">{item.reason} · {item.source}</span><span className="text-[11px] text-slate-500">{item.domain ? `Domain: ${item.domain} · ` : ""}Recorded {new Date(item.created_at).toLocaleString()}</span></div>) : <p className="rounded-lg bg-white/[.03] p-4 text-sm text-slate-400">No suppression entry matches this filter.</p>}</div>
    </section>

    <section id="automation-settings" className="rounded-xl border border-white/10 p-5"><h2 className="text-xl font-semibold">Automation Settings</h2><p className="mt-2 text-sm text-slate-400">Daily research target {data.settings.daily_target}; minimum score {data.settings.min_qualification_score}. Enabling research can prepare locked drafts, but it does not send email. Every draft requires one verified example and founder review.</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void change({ outreach_enabled: !data.settings.outreach_enabled }, "Research setting saved.")} className="rounded-lg bg-emerald-300 px-4 py-2 font-semibold text-[#07110d] disabled:opacity-50">{data.settings.outreach_enabled ? "Pause Automated Research" : "Enable Automated Research"}</button><button type="button" disabled={busy} onClick={() => void change({ pause_campaign: true }, "Campaign paused.")} className="rounded-lg border border-white/15 px-4 py-2 disabled:opacity-50">Pause Campaign</button><button type="button" disabled={busy} onClick={() => void change({ kill_switch: !data.settings.kill_switch }, "Emergency switch updated.")} className="rounded-lg border border-red-300/30 px-4 py-2 text-red-200 disabled:opacity-50">{data.settings.kill_switch ? "Release Global Emergency Kill Switch" : "Global Emergency Kill Switch"}</button></div>{data.settings.kill_switch && <p className="mt-3 text-sm text-red-200">Emergency kill switch is active. No automated draft research will run.</p>}</section>
  </main>;
}
