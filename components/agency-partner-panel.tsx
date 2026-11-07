"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertBanner } from "@/components/ui/alert-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { buildAgencyReferralLink } from "@/lib/referral-code";

type Referral = { id: string; referral_code: string; status: string; visit_count: number; partner_application_id: string | null; referred_workspace_domain: string | null; converted_at: string | null; created_at: string };

export function AgencyPartnerPanel({ domain, domains }: { domain: string; domains: string[] }) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(Boolean(domain));
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!domain) return;
    let active = true;
    void fetch(`/api/agency-referrals?domain=${encodeURIComponent(domain)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { referrals?: Referral[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Referral links could not be loaded.");
        if (active) { setReferrals(body.referrals ?? []); setError(null); setLoading(false); }
      })
      .catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : "Referral links could not be loaded."); setLoading(false); } });
    return () => { active = false; };
  }, [domain, retry]);

  async function create() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/agency-referrals?domain=${encodeURIComponent(domain)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
      const body = await response.json() as { referral?: Referral; error?: string };
      if (!response.ok || !body.referral) throw new Error(body.error ?? "Referral link could not be created.");
      setReferrals((current) => [body.referral!, ...current]);
      setNotice("Partner link created.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Referral link could not be created."); }
    finally { setBusy(false); }
  }

  async function copy(code: string) {
    const link = buildAgencyReferralLink(window.location.origin, code, { domain: domain || domains[0], agency: label.trim() || undefined });
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError("Clipboard access is unavailable. Copy this link from the browser address bar after opening the pitch scan."); }
  }

  return <Card id="agency-partner" className="border-white/10 bg-[#0D1119] text-[#F5F7FA]">
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">Agency Partner &amp; Referrals</CardTitle><p className="mt-1 text-xs text-slate-400">Create co-branded forensic scan links and see attributable applications and workspace conversions.</p></div><Badge variant="outline" className="border-emerald-300/20 text-emerald-200">{referrals.length} links</Badge></div></CardHeader>
    <CardContent>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><label className="text-xs text-slate-300">Agency label<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="Your agency" className="mt-1.5 min-h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white" /></label><Button disabled={busy || !domain} onClick={create} className="self-end bg-[#37F5A0] text-[#07110d]">{busy ? "Creating…" : "Create partner link"}</Button></div>
      {notice && <p role="status" className="mt-3 text-xs text-emerald-200">{notice}</p>}
      {!domain ? <div className="mt-5"><EmptyState title="Choose a workspace first" description="Connect a domain before creating an agency referral link." action={<Link href="/#audit" className="text-xs font-semibold text-emerald-300">Connect website</Link>} /></div> : loading ? <div role="status" aria-label="Loading partner referrals" className="mt-5 space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : error ? <div className="mt-5"><AlertBanner tone="danger" title="Partner referrals are unavailable">{error}<button type="button" onClick={() => { setLoading(true); setRetry(value => value + 1); }} className="ml-2 font-semibold underline">Retry</button></AlertBanner></div> : referrals.length === 0 ? <div className="mt-5"><EmptyState title="No partner links yet" description="Create a co-branded scan link to start tracking visits and referred workspaces." action={<button type="button" onClick={() => document.querySelector<HTMLInputElement>('#agency-partner input')?.focus()} className="text-xs font-semibold text-emerald-300">Enter agency label</button>} /></div> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-slate-500"><tr><th className="pb-2 font-medium">Referral code</th><th className="pb-2 font-medium">Visits</th><th className="pb-2 font-medium">Applications</th><th className="pb-2 font-medium">Workspaces</th><th className="pb-2" /></tr></thead><tbody>{referrals.map((item) => <tr key={item.id} className="border-t border-white/[.06]"><td className="py-3 font-mono text-slate-300">{item.referral_code}</td><td className="py-3">{item.visit_count}</td><td className="py-3">{item.partner_application_id ? 1 : 0}</td><td className="py-3">{item.referred_workspace_domain ?? "—"}</td><td className="py-3 text-right"><button type="button" onClick={() => void copy(item.referral_code)} className={buttonVariants({ variant: "outline", size: "sm" })}>{copied ? "Copied" : "Copy co-branded scan link"}</button></td></tr>)}</tbody></table></div>}
      <p className="mt-3 text-[11px] leading-5 text-slate-500">Visits are counted without storing visitor IP addresses. Applications and workspace conversions are recorded separately; a conversion requires an authenticated workspace session.</p>
    </CardContent>
  </Card>;
}
