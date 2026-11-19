"use client";

import { useState, type FormEvent, type ReactNode } from "react";

type Report = {
  url: string; httpStatus: number | null; linkState: string;
  waybackSnapshot: { url: string; capturedAt: string } | null;
  crawlerAccess: Record<string, boolean | null>; navigationLinkCount: number | null;
  navigationBloat: boolean | null; serverRendered: boolean | null;
  metadata: { titlePresent: boolean; descriptionPresent: boolean; canonicalPresent: boolean; canonical: string | null; canonicalMatchesHost: boolean | null; jsonLdBlockCount: number; jsonLdValidCount: number } | null;
  limits: string;
};

export function FreeProvenanceAuditor() {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [leadBusy, setLeadBusy] = useState(false);
  const [error, setError] = useState("");
  const [leadMessage, setLeadMessage] = useState("");

  async function scan(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setReport(null); setLeadMessage("");
    try {
      const response = await fetch("/api/free-provenance-audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scan", url }) });
      const payload = await response.json() as Report & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The scan failed.");
      setReport(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The scan failed."); }
    finally { setBusy(false); }
  }

  async function capture(event: FormEvent) {
    event.preventDefault(); if (!report) return;
    setLeadBusy(true); setLeadMessage("");
    try {
      const response = await fetch("/api/free-provenance-audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lead", url: report.url, email }) });
      const payload = await response.json() as { received?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Your request could not be saved.");
      setLeadMessage("Thanks. Your contact request was saved."); setEmail("");
    } catch (cause) { setLeadMessage(cause instanceof Error ? cause.message : "Your request could not be saved."); }
    finally { setLeadBusy(false); }
  }

  return <section id="free-provenance-auditor" aria-label="Free CiteMend provenance and broken-citation auditor" className="cm-container py-16">
    <div className="cm-panel mx-auto max-w-5xl p-5 sm:p-8">
      <p className="cm-kicker">Free public page check</p>
      <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Provenance &amp; broken-citation auditor</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Check one public page for HTTP status, archive history on confirmed 404/410, AI crawler robots rules, navigation bloat, and basic metadata. No account or AI API call is needed.</p>
      <form onSubmit={scan} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input aria-label="Public page URL" type="text" inputMode="url" required maxLength={2048} placeholder="https://example.com/old-guide" value={url} onChange={event => setUrl(event.target.value)} className="min-h-11 flex-1 rounded-lg border border-white/15 bg-[#101719] px-4 text-sm text-white" />
        <button disabled={busy} type="submit" className="min-h-11 rounded-lg bg-emerald-300 px-5 text-sm font-semibold text-[#07110d] disabled:opacity-50">{busy ? "Checking…" : "Check page"}</button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>}
      {report && <div className="mt-6 space-y-5" aria-live="polite">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Result label="HTTP status" value={report.httpStatus === null ? "Unavailable" : String(report.httpStatus)} note={report.linkState === "permanent_dead" ? "Confirmed 404/410" : report.linkState === "unavailable" ? "Temporary or unknown" : "Observed response"} />
          <Result label="Wayback snapshot" value={report.waybackSnapshot ? new Date(report.waybackSnapshot.capturedAt).toLocaleDateString() : "None returned"} note={report.waybackSnapshot ? <a href={report.waybackSnapshot.url} target="_blank" rel="noreferrer" className="text-emerald-300 underline">View archive capture</a> : "Checked only for 404/410"} />
          <Result label="Navigation links" value={report.navigationLinkCount === null ? "Unavailable" : String(report.navigationLinkCount)} note={report.navigationBloat === null ? "Page HTML unavailable" : report.navigationBloat ? "60 or more links" : "Below 60 links"} />
          <Result label="Initial HTML text" value={report.serverRendered === null ? "Unavailable" : report.serverRendered ? "Present" : "Sparse"} note="A deterministic SSR signal" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 p-4"><h3 className="text-sm font-semibold text-white">Robots access by crawler</h3><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">{Object.entries(report.crawlerAccess).map(([bot, allowed]) => <p key={bot}>{bot}: <span className="text-white">{allowed === null ? "Unknown" : allowed ? "Allowed" : "Disallowed"}</span></p>)}</div></div>
          <div className="rounded-xl border border-white/10 p-4"><h3 className="text-sm font-semibold text-white">Page metadata</h3><p className="mt-3 text-xs leading-6 text-slate-300">{report.metadata ? `Title ${report.metadata.titlePresent ? "present" : "missing"} · Description ${report.metadata.descriptionPresent ? "present" : "missing"} · Canonical ${report.metadata.canonicalPresent ? report.metadata.canonicalMatchesHost ? "same host" : "different host" : "missing or invalid"} · JSON-LD ${report.metadata.jsonLdValidCount}/${report.metadata.jsonLdBlockCount} valid blocks` : "Unavailable because page HTML was not returned."}</p></div>
        </div>
        <p className="text-xs leading-5 text-slate-500">{report.limits}</p>
        <form onSubmit={capture} className="rounded-xl border border-emerald-300/20 bg-emerald-300/[.04] p-4"><label htmlFor="provenance-lead-email" className="block text-sm font-semibold text-white">Want help reviewing this page?</label><p className="mt-1 text-xs text-slate-400">Leave your email to request a follow-up about this URL.</p><div className="mt-3 flex flex-col gap-3 sm:flex-row"><input id="provenance-lead-email" type="email" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" className="min-h-10 flex-1 rounded-lg border border-white/15 bg-[#101719] px-3 text-sm text-white" /><button type="submit" disabled={leadBusy} className="min-h-10 rounded-lg bg-emerald-300 px-4 text-xs font-semibold text-[#07110d] disabled:opacity-50">{leadBusy ? "Saving…" : "Request follow-up"}</button></div>{leadMessage && <p role="status" className="mt-2 text-xs text-slate-300">{leadMessage}</p>}</form>
      </div>}
    </div>
  </section>;
}

function Result({ label, value, note }: { label: string; value: string; note: ReactNode }) {
  return <article className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></article>;
}
