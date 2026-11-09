"use client";

import { useCallback, useEffect, useState } from "react";

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
  settings: { outreach_enabled: boolean; kill_switch: boolean; daily_target: number; daily_send_limit: number; min_qualification_score: number };
  prospects: { id: string; domain: string; company_name: string | null; qualification_score: number; status: string }[];
  emails: { id: string; recipient: string; subject: string; status: string; body_text: string; factuality_report: { passed?: boolean; approvalStatus?: string; claims?: VerifiedExample[] } }[];
  runs: { id: string; run_date: string; status: string; discovered: number; emails_sent: number; errors: number }[];
  suppressions: { id: string; email: string; reason: string; source: string }[];
  replies: { id: string; email_id: string | null; payload: Record<string, unknown>; occurred_at: string }[];
};

export default function AiOutreachDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const refresh = useCallback(async () => {
    try { const response = await fetch("/api/admin/outreach", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setData(result); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load outreach data."); }
  }, []);
  useEffect(() => { let active = true; fetch("/api/admin/outreach", { cache: "no-store" }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (active) { setData(result as Data); setError(""); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load outreach data."); }); return () => { active = false; }; }, []);
  async function change(body: Record<string, unknown>) {
    setBusy(true); setNote("");
    try { const response = await fetch("/api/admin/outreach", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setNote("Automation settings saved."); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Update failed."); }
    finally { setBusy(false); }
  }
  if (error) return <main className="mx-auto max-w-6xl p-8 text-white"><h1 className="text-3xl font-semibold">AI Outreach</h1><p className="mt-4 rounded-lg border border-amber-300/20 p-4 text-amber-200">{error}</p><button onClick={() => void refresh()} className="mt-4 rounded border border-white/20 px-4 py-2">Retry</button></main>;
  if (!data) return <main className="p-8 text-slate-300">Loading AI Outreach…</main>;
  const sections = ["Outreach Overview", "Prospect Pipeline & Citation Evidence", "Email Preview & Factuality Report", "Sending Activity & Replies", "Suppression Center", "Automation Settings"];
  return <main className="mx-auto max-w-6xl space-y-8 p-5 text-slate-100 sm:p-8">
    <header><p className="font-mono text-xs uppercase tracking-[.2em] text-emerald-300">Founder controls</p><h1 className="mt-2 text-3xl font-semibold">AI Outreach</h1><p className="mt-2 text-sm text-slate-400">Verified findings and one-example email drafts. The daily job never sends outreach; each draft remains pending founder review.</p><nav className="mt-5 flex flex-wrap gap-2">{sections.map(section => <a key={section} href={`#${section.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs">{section}</a>)}</nav></header>
    <section id="outreach-overview" className="grid gap-3 sm:grid-cols-4">{[["Prospects", data.prospects.length], ["Qualified", data.prospects.filter(item => item.status === "qualified").length], ["Pending founder review", data.emails.filter(item => item.status === "pending_review").length], ["Suppressed", data.suppressions.length]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</section>
    <section id="prospect-pipeline-citation-evidence" className="rounded-xl border border-white/10 p-5"><h2 className="text-xl font-semibold">Prospect Pipeline &amp; Citation Evidence</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-slate-400"><th className="p-2">Company</th><th className="p-2">Domain</th><th className="p-2">Score</th><th className="p-2">Status</th><th className="p-2">Report</th></tr></thead><tbody>{data.prospects.map(item => <tr key={item.id} className="border-t border-white/5"><td className="p-2">{item.company_name}</td><td className="p-2">{item.domain}</td><td className="p-2">{item.qualification_score}/100</td><td className="p-2">{item.status}</td><td className="p-2"><a className="text-emerald-300 underline" href={`/report/${encodeURIComponent(item.domain)}`} target="_blank" rel="noreferrer">Open report</a></td></tr>)}</tbody></table></div></section>
    <section id="email-preview-factuality-report" className="rounded-xl border border-white/10 p-5"><h2 className="text-xl font-semibold">Email Preview &amp; Factuality Report</h2><p className="mt-2 text-sm text-slate-400">Review one dead URL, status, detection date, citation referrer, verified replacement reason, and opt-out link before any manual use.</p><div className="mt-4 space-y-3">{data.emails.slice(0, 10).map(email => <details key={email.id} className="rounded-lg bg-white/[.03] p-3 text-sm"><summary className="cursor-pointer"><b>{email.subject}</b><span className="ml-3 text-xs text-slate-400">{email.status} · {email.recipient}</span></summary><pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-300">{email.body_text}</pre><p className="mt-3 text-xs font-semibold">Factuality report: {email.factuality_report.passed ? "passed" : "not passed"} · {email.factuality_report.approvalStatus ?? "founder review required"}</p>{email.factuality_report.claims?.map((example, index) => <dl key={`${email.id}-${index}`} className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2"><div><dt className="font-semibold">Verified dead URL · HTTP {example.status}</dt><dd className="break-all"><a className="text-emerald-300 underline" href={example.deadUrl} target="_blank" rel="noreferrer">{example.deadUrl}</a></dd></div><div><dt className="font-semibold">Detection date</dt><dd>{new Date(example.detectedAt).toISOString().slice(0, 10)}</dd></div><div><dt className="font-semibold">Citation / referrer</dt><dd className="break-all"><a className="text-emerald-300 underline" href={example.referrerUrl} target="_blank" rel="noreferrer">{example.referrerUrl}</a> · {example.referrerContext}</dd></div><div><dt className="font-semibold">Suggested live replacement</dt><dd className="break-all">{example.replacementUrl ?? "No replacement verified; no email generated."}{example.replacementReason && <p className="mt-1">{example.replacementReason}</p>}</dd></div></dl>)}</details>)}</div></section>
    <section id="sending-activity-replies" className="rounded-xl border border-white/10 p-5"><h2 className="text-xl font-semibold">Sending Activity &amp; Replies</h2><div className="mt-4 space-y-2">{data.runs.map(run => <div key={run.id} className="rounded-lg bg-white/[.03] p-3 text-sm">{run.run_date} · {run.status} · {run.discovered} discovered · {run.emails_sent} sent · {run.errors} errors</div>)}</div><h3 className="mt-5 text-sm font-semibold">Received replies</h3>{data.replies.length ? data.replies.map(reply => <div key={reply.id} className="mt-2 rounded-lg bg-white/[.03] p-3 text-sm">{String(reply.payload.from ?? "Contact")} · {new Date(reply.occurred_at).toLocaleString()}<p className="mt-1 text-xs text-slate-400">{String(reply.payload.excerpt ?? "Reply recorded")}</p></div>) : <p className="mt-2 text-sm text-slate-400">No replies recorded. Connect your inbound mail workflow to the signed reply endpoint.</p>}</section>
    <section id="suppression-center" className="rounded-xl border border-white/10 p-5"><h2 className="text-xl font-semibold">Suppression Center</h2><div className="mt-4 space-y-2">{data.suppressions.map(item => <div key={item.id} className="rounded-lg bg-white/[.03] p-3 text-sm">{item.email} · {item.reason} · {item.source}</div>)}</div></section>
    <section id="automation-settings" className="rounded-xl border border-white/10 p-5"><h2 className="text-xl font-semibold">Automation Settings</h2><p className="mt-2 text-sm text-slate-400">Daily research target {data.settings.daily_target}; minimum score {data.settings.min_qualification_score}. Emails are not sent by this automation and require one verified example plus founder review.</p><div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} onClick={() => void change({ outreach_enabled: !data.settings.outreach_enabled })} className="rounded-lg bg-emerald-300 px-4 py-2 font-semibold text-[#07110d]">{data.settings.outreach_enabled ? "Pause Automated Research" : "Enable Automated Research"}</button><button disabled={busy} onClick={() => void change({ pause_campaign: true })} className="rounded-lg border border-white/15 px-4 py-2">Pause Campaign</button><button disabled={busy} onClick={() => void change({ kill_switch: !data.settings.kill_switch })} className="rounded-lg border border-red-300/30 px-4 py-2 text-red-200">{data.settings.kill_switch ? "Release Global Emergency Kill Switch" : "Global Emergency Kill Switch"}</button></div>{data.settings.kill_switch && <p className="mt-3 text-sm text-red-200">Emergency kill switch is active. No automated draft research will run.</p>}{note && <p role="status" className="mt-3 text-sm text-emerald-200">{note}</p>}</section>
  </main>;
}
