"use client";

import { FormEvent, useState } from "react";
import type { ForensicTeaserReport } from "@/lib/forensic-teaser";

type Result = { received: true; message: string; teaserStatus: string; teaser: ForensicTeaserReport | null; disclosure: string };

export function DesignPartnerApplicationForm({ referralCode }: { referralCode?: string }) {
  const [form, setForm] = useState({ contactName: "", contactEmail: "", companyName: "", domain: "", segment: "agency", clientOrCatalogSize: "5", buyerPrompt: "", primaryPainPoint: "" });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null); setResult(null);
    try {
      const response = await fetch("/api/design-partners/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, clientOrCatalogSize: Number(form.clientOrCatalogSize), ...(referralCode ? { referralCode } : {}) }) });
      const body = await response.json() as Result | { error?: string };
      if (!response.ok) throw new Error("error" in body ? body.error : "Your application could not be submitted.");
      setResult(body as Result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your application could not be submitted."); }
    finally { setLoading(false); }
  }

  const inputClass = "mt-1.5 min-h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white placeholder:text-slate-600 focus:border-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/20";
  return <div className="rounded-2xl border border-white/10 bg-[#0D1119] p-5 sm:p-7">
    {result ? <div role="status"><span className="rounded-full border border-emerald-300/20 bg-emerald-300/[.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">Application received</span><h2 className="mt-4 text-2xl font-semibold text-white">Thanks, {form.contactName}.</h2><p className="mt-2 text-sm leading-6 text-slate-400">{result.message} Paid beta access is reviewed and invited separately; this submission does not start a subscription.</p><div className="mt-5 rounded-xl border border-white/[.08] bg-black/10 p-4"><h3 className="text-sm font-semibold text-white">Your automatic teaser audit</h3>{result.teaser ? <><p className="mt-2 text-sm text-slate-300">{result.teaser.diagnosticSummary}</p><p className="mt-1 text-xs text-slate-500">Broken or missing URL mentions: {result.teaser.citationSummary.brokenOrMissingCount ?? "not available"} · Mode: {result.teaser.runMode}</p>{result.teaser.findings.slice(0, 3).map((finding) => <p key={finding.kind} className="mt-2 text-xs text-slate-400"><span className="font-semibold text-slate-200">{finding.kind.replaceAll("_", " ")}:</span> {finding.observableEvidence[0]}</p>)}</> : <p className="mt-2 text-xs text-amber-100">The application was saved, but an AI provider was unavailable. You can still open the public scan later and retry.</p>}</div><p className="mt-4 text-[11px] leading-5 text-slate-500">{result.disclosure}</p><button type="button" onClick={() => setResult(null)} className="mt-5 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:border-emerald-300/40">Submit another application</button></div> : <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-300">Your name<input required maxLength={120} value={form.contactName} onChange={(event) => update("contactName", event.target.value)} className={inputClass} autoComplete="name" /></label>
      <label className="text-xs font-semibold text-slate-300">Work email<input required type="email" maxLength={320} value={form.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} className={inputClass} autoComplete="email" /></label>
      <label className="text-xs font-semibold text-slate-300">Company or agency<input required maxLength={160} value={form.companyName} onChange={(event) => update("companyName", event.target.value)} className={inputClass} autoComplete="organization" /></label>
      <label className="text-xs font-semibold text-slate-300">Public website domain<input required value={form.domain} onChange={(event) => update("domain", event.target.value)} className={inputClass} placeholder="example.com" autoComplete="url" /></label>
      <label className="text-xs font-semibold text-slate-300">Program track<select value={form.segment} onChange={(event) => update("segment", event.target.value)} className={inputClass}><option value="agency">SEO/GEO agency</option><option value="saas">B2B SaaS</option><option value="ecommerce">Ecommerce</option></select></label>
      <label className="text-xs font-semibold text-slate-300">{form.segment === "agency" ? "Clients managed (5–50)" : form.segment === "saas" ? "Content pages or resources" : "Products in catalog"}<input required type="number" min={form.segment === "agency" ? 5 : 1} max={form.segment === "agency" ? 50 : 1000000} value={form.clientOrCatalogSize} onChange={(event) => update("clientOrCatalogSize", event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-semibold text-slate-300 sm:col-span-2">One buyer-intent prompt<input required minLength={8} maxLength={4000} value={form.buyerPrompt} onChange={(event) => update("buyerPrompt", event.target.value)} className={inputClass} placeholder="What is the best platform for…?" /></label>
      <label className="text-xs font-semibold text-slate-300 sm:col-span-2">Primary AI search pain point<textarea required minLength={12} maxLength={1200} rows={3} value={form.primaryPainPoint} onChange={(event) => update("primaryPainPoint", event.target.value)} className={`${inputClass} py-2.5`} placeholder="What is hard to observe, explain, or recover today?" /></label>
      <p className="text-[11px] leading-5 text-slate-500 sm:col-span-2">Submitting stores your application for review and automatically runs a rate-limited public forensic teaser. It does not activate beta access or create a paid subscription.</p>
      {error && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/[.06] p-3 text-xs text-rose-100 sm:col-span-2">{error}</p>}
      <button type="submit" disabled={loading} className="min-h-11 rounded-lg bg-[#37F5A0] px-4 text-sm font-bold text-[#07110d] hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60 sm:col-span-2">{loading ? "Submitting and running teaser…" : "Apply and run my teaser scan"}</button>
    </form>}
  </div>;
}
