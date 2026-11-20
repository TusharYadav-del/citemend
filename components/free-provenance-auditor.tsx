"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, CircleHelp, FileSearch, Globe2, ShieldCheck } from "lucide-react";

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

  return (
    <section id="free-provenance-auditor" aria-labelledby="free-auditor-heading" className="cm-container scroll-mt-24 py-[var(--space-section)]">
      <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-start lg:gap-12">
        <div className="max-w-xl">
          <p className="cm-kicker">Free public page check</p>
          <h2 id="free-auditor-heading" className="mt-4 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Inspect a page before you make a change.</h2>
          <p className="mt-4 text-base leading-7 text-text-secondary">Check the public response, archived history for confirmed dead pages, crawler access, navigation links, and basic metadata.</p>
          <div className="mt-6 space-y-3 text-sm text-text-secondary">
            <p className="flex items-center gap-2"><Globe2 aria-hidden="true" className="size-4 text-accent" />One public HTTP(S) page</p>
            <p className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4 text-success" />No account or AI API call required</p>
            <p className="flex items-center gap-2"><CircleHelp aria-hidden="true" className="size-4 text-text-tertiary" />Unavailable checks remain unknown</p>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-6">
          <form onSubmit={scan} className="flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="free-provenance-url">Public page URL</label>
            <input id="free-provenance-url" aria-label="Public page URL" type="text" inputMode="url" required maxLength={2048} placeholder="https://example.com/old-guide" value={url} onChange={event => setUrl(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-text-tertiary focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30" />
            <button disabled={busy} type="submit" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60">{busy ? "Checking…" : "Check public page"}<ArrowUpRight aria-hidden="true" className="size-4" /></button>
          </form>
          <p className="mt-2.5 text-xs leading-5 text-text-tertiary">The scan uses only the URL you enter and checks one page.</p>
          {busy && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-accent"><span aria-hidden="true" className="size-3 animate-pulse rounded-full bg-accent" />Checking the page and its public signals…</p>}
          {error && <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">{error}</p>}

          {report && <div className="mt-6 space-y-4" aria-live="polite">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3"><div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[.12em] text-text-tertiary">Checked page</p><p className="mt-1 break-all font-mono text-sm text-foreground">{report.url}</p></div><span className="rounded-md border border-accent/25 bg-accent/5 px-2 py-1 font-mono text-[10px] text-accent">CHECK COMPLETE</span></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Result label="HTTP status" value={report.httpStatus === null ? "Unavailable" : String(report.httpStatus)} note={report.linkState === "permanent_dead" ? "Confirmed 404/410" : report.linkState === "unavailable" ? "Temporary or unknown" : "Observed response"} />
              <Result label="Wayback snapshot" value={report.waybackSnapshot ? new Date(report.waybackSnapshot.capturedAt).toLocaleDateString() : "None returned"} note={report.waybackSnapshot ? <a href={report.waybackSnapshot.url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">View archive capture <ArrowUpRight aria-hidden="true" className="inline size-3.5" /></a> : "Checked only for 404/410"} />
              <Result label="Navigation links" value={report.navigationLinkCount === null ? "Unavailable" : String(report.navigationLinkCount)} note={report.navigationBloat === null ? "Page HTML unavailable" : report.navigationBloat ? "60 or more links" : "Below 60 links"} />
              <Result label="Initial HTML text" value={report.serverRendered === null ? "Unavailable" : report.serverRendered ? "Present" : "Sparse"} note="A deterministic SSR signal" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-border p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck aria-hidden="true" className="size-4 text-accent" />Robots access by crawler</h3><div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-text-secondary">{Object.entries(report.crawlerAccess).map(([bot, allowed]) => <p key={bot} className="min-w-0 break-words">{bot}: <span className="font-medium text-foreground">{allowed === null ? "Unknown" : allowed ? "Allowed" : "Disallowed"}</span></p>)}</div></div>
              <div className="rounded-md border border-border p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><FileSearch aria-hidden="true" className="size-4 text-accent" />Page metadata</h3><p className="mt-3 text-xs leading-6 text-text-secondary">{report.metadata ? `Title ${report.metadata.titlePresent ? "present" : "missing"} · Description ${report.metadata.descriptionPresent ? "present" : "missing"} · Canonical ${report.metadata.canonicalPresent ? report.metadata.canonicalMatchesHost ? "same host" : "different host" : "missing or invalid"} · JSON-LD ${report.metadata.jsonLdValidCount}/${report.metadata.jsonLdBlockCount} valid blocks` : "Unavailable because page HTML was not returned."}</p></div>
            </div>
            <p className="border-l-2 border-accent/40 pl-3 text-xs leading-5 text-text-tertiary">{report.limits}</p>
            <form onSubmit={capture} className="rounded-md border border-border bg-surface-raised p-4">
              <label htmlFor="provenance-lead-email" className="block text-sm font-semibold text-foreground">Want help reviewing this page?</label><p className="mt-1 text-sm text-text-secondary">Leave your email to request a follow-up about this URL.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input id="provenance-lead-email" type="email" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-text-tertiary focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30" /><button type="submit" disabled={leadBusy} className="min-h-11 rounded-md border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60">{leadBusy ? "Saving…" : "Request follow-up"}<ArrowUpRight aria-hidden="true" className="ml-1 inline size-4" /></button></div>
              {leadMessage && <p role="status" className="mt-3 text-sm text-text-secondary">{leadMessage}</p>}
            </form>
          </div>}
        </div>
      </div>
    </section>
  );
}

function Result({ label, value, note }: { label: string; value: string; note: ReactNode }) {
  return <article className="min-w-0 rounded-md border border-border bg-background p-3.5"><p className="font-mono text-[10px] uppercase tracking-[.1em] text-text-tertiary">{label}</p><p className="mt-2 break-words font-mono text-lg font-semibold tabular-nums text-foreground">{value}</p><p className="mt-1 text-xs leading-5 text-text-secondary">{note}</p></article>;
}
