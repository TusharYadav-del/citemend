"use client";
import { useEffect, useState } from "react";
import { DEFAULT_AGENCY_COLOR, type AgencyProfile } from "@/lib/agency-whitelabel";

const empty: AgencyProfile = { agency_brand_name: null, agency_logo_url: null, agency_primary_color: DEFAULT_AGENCY_COLOR, agency_cta_text: null, agency_cta_url: null };
export default function AgencyProfileSettings({ domains, isPro }: { domains: string[]; isPro: boolean | null }) {
  const [domain, setDomain] = useState(domains[0] ?? "");
  const [profile, setProfile] = useState<AgencyProfile>(empty);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!domain || !isPro) return;
    let cancelled = false;
    fetch(`/api/settings/whitelabel?domain=${encodeURIComponent(domain)}`).then(async response => { if (!response.ok) throw new Error("Could not load the profile."); return response.json() as Promise<{ profile: AgencyProfile | null }>; }).then(data => { if (!cancelled) { setProfile(data.profile ?? empty); setMessage(""); } }).catch(() => { if (!cancelled) setMessage("Could not load the profile."); });
    return () => { cancelled = true; };
  }, [domain, isPro]);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/settings/whitelabel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, profile }) });
      const data = await response.json() as { error?: string; profile?: AgencyProfile };
      if (!response.ok) throw new Error(data.error ?? "Could not save the profile.");
      setProfile(data.profile ?? empty); setMessage("Saved. New audits for this domain will use this profile.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the profile."); }
    finally { setBusy(false); }
  }
  const fields = [
    ["agency_brand_name", "Agency name", "Apex Growth Agency", 120], ["agency_logo_url", "Logo URL", "https://example.com/logo.png", 2048],
    ["agency_cta_text", "Button text", "Book Your 15-Min AI Search Recovery Call", 160], ["agency_cta_url", "Booking URL", "https://example.com/book", 2048],
  ] as const;
  return <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-base font-semibold text-white">Agency white-label profile</h2>
    {!isPro ? <p className="mt-2 text-sm text-slate-400">White-label profiles are available with Pro, VIP Beta, or Agency access.</p> : !domain ? <p className="mt-2 text-sm text-slate-400">Run an audit to configure a domain.</p> : <>
      {domains.length > 1 && <label className="mt-3 block text-xs text-slate-300">Domain <select value={domain} onChange={event => { setDomain(event.target.value); setProfile(empty); }} className="ml-2 rounded bg-slate-800 p-2">{domains.map(item => <option key={item}>{item}</option>)}</select></label>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map(([field, label, placeholder, maxLength]) => <label key={field} className="text-xs text-slate-300">{label}<input value={profile[field] ?? ""} onChange={event => setProfile(current => ({ ...current, [field]: event.target.value }))} placeholder={placeholder} maxLength={maxLength} className="mt-1 w-full rounded border border-white/10 bg-black/30 p-2 text-sm text-white" /></label>)}<label className="text-xs text-slate-300">Primary color <input type="color" value={profile.agency_primary_color} onChange={event => setProfile(current => ({ ...current, agency_primary_color: event.target.value }))} className="ml-2 h-9 w-14 align-middle" /></label></div>
      <button type="button" disabled={busy} onClick={() => void save()} className="mt-4 rounded bg-emerald-400 px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">{busy ? "Saving…" : "Save white-label profile"}</button><p role="status" className="mt-2 text-xs text-slate-300">{message}</p><p className="mt-2 text-xs text-slate-500">Branding is saved with new audits. Clear the agency name, logo and CTA to disable it.</p>
    </>}
  </section>;
}
