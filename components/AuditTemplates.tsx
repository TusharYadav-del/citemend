"use client";
import { useState } from "react";
import { AUDIT_TEMPLATES } from "@/lib/onboarding";

export default function AuditTemplates() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(name: keyof typeof AUDIT_TEMPLATES) {
    try { await navigator.clipboard.writeText(AUDIT_TEMPLATES[name].join("\n")); setCopied(name); }
    catch { setCopied("Copy unavailable; select prompts below."); }
  }
  return <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4" aria-label="Audit templates"><h2 className="text-sm font-semibold">Audit templates</h2><p className="mt-1 text-xs text-slate-400">Copy a starting set, replace bracketed text with your product facts, then paste prompts into your audit.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(AUDIT_TEMPLATES).map(([name, prompts]) => <article key={name} className="rounded-lg border border-white/10 p-3"><h3 className="text-xs font-semibold text-slate-200">{name}</h3><ul className="mt-2 space-y-1 text-[11px] text-slate-400">{prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul><button type="button" onClick={() => void copy(name as keyof typeof AUDIT_TEMPLATES)} className="mt-3 rounded-md border border-emerald-300/20 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300">Copy prompts</button></article>)}</div>{copied && <p role="status" className="mt-2 text-xs text-emerald-300">{copied === "Copy unavailable; select prompts below." ? copied : `${copied} copied.`}</p>}</section>;
}
