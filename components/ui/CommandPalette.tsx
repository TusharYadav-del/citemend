"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileDown, Globe2, Link2, Loader2, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import type { SidebarItem } from "./sidebar";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";

type Command = { id: string; label: string; detail: string; keywords: string; action: () => void };
type ActionForm = "scan" | "forensic" | null;

function matches(query: string, command: Command) {
  const needle = query.toLowerCase().trim();
  if (!needle) return true;
  const haystack = `${command.label} ${command.detail} ${command.keywords}`.toLowerCase();
  if (haystack.includes(needle)) return true;
  let at = 0;
  for (const char of haystack) if (char === needle[at]) at++;
  return at === needle.length;
}

export function CommandPalette({ items, domains, selectedDomain, canScan, canApprove, latestAuditId }: {
  items: SidebarItem[]; domains: string[]; selectedDomain: string; canScan: boolean; canApprove: boolean; latestAuditId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [form, setForm] = useState<ActionForm>(null);
  const [domain, setDomain] = useState(selectedDomain || domains[0] || "");
  const [firstPrompt, setFirstPrompt] = useState("");
  const [secondPrompt, setSecondPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setForm(null); setMessage(null); setOpen(value => !value); }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) inputRef.current?.focus(); else openerRef.current?.focus(); }, [open]);
  const navigate = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);
  const base = selectedDomain ? `/dashboard?domain=${encodeURIComponent(selectedDomain)}` : "/dashboard";
  const commands = useMemo<Command[]>(() => [
    ...items.map(item => ({ id: `screen:${item.label}`, label: item.label, detail: "Dashboard screen", keywords: item.href, action: () => navigate(item.href) })),
    ...domains.map(value => ({ id: `domain:${value}`, label: value, detail: "Switch workspace", keywords: "client domain workspace", action: () => navigate(`/dashboard?domain=${encodeURIComponent(value)}#overview`) })),
    ...(canScan ? [{ id: "scan", label: "New background scan", detail: "Run two buyer prompts in the job queue", keywords: "audit model probe", action: () => { setForm("scan"); setQuery(""); setMessage(null); } }] : []),
    { id: "forensic", label: "Run forensic check", detail: "Check one buyer prompt and public evidence", keywords: "forensics diagnosis", action: () => { setForm("forensic"); setQuery(""); setMessage(null); } },
    ...(canApprove ? [{ id: "approvals", label: "URLs awaiting approval", detail: "Filter Recovery Center to pending URLs", keywords: "broken redirect review", action: () => navigate(`${base}${base.includes("?") ? "&" : "?"}recovery=pending#recovery-command`) }] : []),
    ...(latestAuditId ? [{ id: "export", label: "Export before and after report", detail: "Open print view; save as PDF with configured branding", keywords: "white label pdf", action: () => navigate(`/audit/${latestAuditId}?print=1`) }] : []),
  ], [items, domains, canScan, canApprove, latestAuditId, base, navigate]);
  const filtered = commands.filter(command => matches(query, command)).slice(0, 18);
  function handleSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex(index => (index + 1) % Math.max(filtered.length, 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex(index => (index - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1)); }
    if (event.key === "Enter" && filtered[activeIndex]) { event.preventDefault(); filtered[activeIndex].action(); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    let cleanDomain: string;
    try { cleanDomain = normalizeDashboardDomain(domain); }
    catch { setMessage("Enter a public domain such as example.com."); return; }
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(form === "scan" ? "/api/audit" : "/api/forensics/teaser", {
        method: "POST", headers: { "Content-Type": "application/json", ...(form === "scan" ? { "Idempotency-Key": crypto.randomUUID() } : {}) },
        body: JSON.stringify(form === "scan" ? { domain: cleanDomain, buyerPrompt: firstPrompt, buyerPrompts: [firstPrompt, secondPrompt] } : { domain: cleanDomain, buyerPrompt: firstPrompt }),
      });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The request could not finish.");
      if (form === "scan") {
        if (typeof data.jobId !== "string") throw new Error("The scan did not return a background job.");
        window.dispatchEvent(new CustomEvent("citemend:job-created", { detail: data.jobId }));
        setMessage("Scan queued. The job telemetry pill will track it.");
      } else {
        const summary = typeof data.diagnosticSummary === "string" ? data.diagnosticSummary : "Forensic check completed.";
        setMessage(summary);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "The request could not finish."); }
    finally { setBusy(false); }
  }
  return <>
    <button ref={openerRef} type="button" onClick={() => { setForm(null); setMessage(null); setOpen(true); }} className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-white/[.08] bg-white/[.025] px-3 text-left text-xs text-slate-400 hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300 sm:w-60" aria-label="Open command palette"><Search className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">Search or run a command</span><kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K / Ctrl K</kbd></button>
    {open && <div className="fixed inset-0 z-[100] flex justify-center bg-black/75 px-3 pt-[10vh] backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={event => { if (event.key !== "Tab") return; const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]),textarea:not([disabled]),button:not([disabled])')]; const first = controls[0]; const last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }} className="h-fit max-h-[80vh] w-full max-w-xl overflow-hidden rounded-xl border border-white/[.12] bg-[#101722] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/[.08] px-4"><Search className="size-4 text-emerald-300" /><input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); setForm(null); }} onKeyDown={handleSearchKey} placeholder="Find a screen, workspace, or action" aria-label="Search commands" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /><button type="button" onClick={() => setOpen(false)} aria-label="Close command palette" className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="size-4" /></button></div>
        {form ? <form onSubmit={submit} className="max-h-[65vh] space-y-3 overflow-y-auto p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">{form === "scan" ? <Sparkles className="size-4 text-emerald-300" /> : <ShieldCheck className="size-4 text-emerald-300" />}{form === "scan" ? "New background scan" : "Forensic check"}</div>
          <label className="block text-xs text-slate-400">Public domain<input autoFocus required value={domain} onChange={event => setDomain(event.target.value)} maxLength={300} placeholder="example.com" className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-sm text-white outline-none focus:border-emerald-300/40" /></label>
          <label className="block text-xs text-slate-400">Buyer prompt<textarea required minLength={8} maxLength={4000} value={firstPrompt} onChange={event => setFirstPrompt(event.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white outline-none focus:border-emerald-300/40" /></label>
          {form === "scan" && <label className="block text-xs text-slate-400">Second buyer prompt<textarea required minLength={8} maxLength={4000} value={secondPrompt} onChange={event => setSecondPrompt(event.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white outline-none focus:border-emerald-300/40" /></label>}
          <div className="flex gap-2"><button type="button" onClick={() => { setForm(null); setMessage(null); }} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-300">Back</button><button disabled={busy} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-emerald-300 px-4 py-2 text-xs font-semibold text-[#07110d] disabled:opacity-60">{busy && <Loader2 className="size-3.5 animate-spin" />}{form === "scan" ? "Queue scan" : "Run forensic check"}</button></div>
          {message && <p role="status" className="rounded-lg border border-white/10 bg-white/[.03] p-3 text-xs leading-5 text-slate-200">{message}</p>}
        </form> : <div className="max-h-[65vh] overflow-y-auto p-2">
          {filtered.length ? filtered.map((command, index) => <button key={command.id} type="button" onMouseEnter={() => setActiveIndex(index)} onClick={command.action} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-emerald-300 ${index === activeIndex ? "bg-white/[.07]" : "hover:bg-white/[.04]"}`}><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 text-emerald-300">{command.id.startsWith("domain:") ? <Globe2 className="size-4" /> : command.id === "export" ? <FileDown className="size-4" /> : command.id === "approvals" ? <Link2 className="size-4" /> : <ArrowRight className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{command.label}</span><span className="block truncate text-[11px] text-slate-500">{command.detail}</span></span></button>) : <p className="p-6 text-center text-sm text-slate-400">No matching command. Try a screen name or workspace domain.</p>}
        </div>}
      </section>
    </div>}
  </>;
}
