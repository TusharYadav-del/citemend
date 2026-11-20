"use client";

import { useEffect, useState } from "react";

type Policy = {
  monthly_scan_quota: number;
  observation_retention_days: number;
  require_two_person_redirect_approval: boolean;
  api_rate_limit_per_minute: number;
  allow_benchmark_aggregation: boolean;
  benchmark_category: string;
};

const defaults: Policy = { monthly_scan_quota: 10, observation_retention_days: 365, require_two_person_redirect_approval: false, api_rate_limit_per_minute: 60, allow_benchmark_aggregation: false, benchmark_category: "general" };

export default function WorkspaceGovernanceSettings({ domain }: { domain: string }) {
  const [policy, setPolicy] = useState<Policy>(defaults);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domain) return;
    let active = true;
    fetch(`/api/workspaces/governance?domain=${encodeURIComponent(domain)}`)
      .then(async response => {
        const body = await response.json().catch(() => null) as { policy?: Policy; error?: string } | null;
        if (!response.ok) throw new Error(body?.error ?? "Could not load governance policy.");
        if (active && body?.policy) setPolicy({ ...defaults, ...body.policy });
      })
      .catch(error => { if (active) setStatus(error instanceof Error ? error.message : "Could not load governance policy."); });
    return () => { active = false; };
  }, [domain]);

  async function save() {
    if (busy) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`/api/workspaces/governance?domain=${encodeURIComponent(domain)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policy) });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Policy update failed.");
      setStatus("Governance policy saved.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Policy update failed."); }
    finally { setBusy(false); }
  }

  return <section className="rounded-xl border border-border bg-surface-raised p-4">
    <h2 className="text-sm font-semibold">Workspace governance</h2>
    <label className="mt-3 block text-xs">Monthly scan quota<input type="number" min={1} max={10000} value={policy.monthly_scan_quota} onChange={event => setPolicy({ ...policy, monthly_scan_quota: Number(event.target.value) })} className="mt-1 block w-full rounded border border-border bg-background px-2 py-2" /></label>
    <label className="mt-3 block text-xs">Evidence retention<select value={policy.observation_retention_days} onChange={event => setPolicy({ ...policy, observation_retention_days: Number(event.target.value) })} className="mt-1 block w-full rounded border border-border bg-background px-2 py-2"><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option></select></label>
    <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={policy.require_two_person_redirect_approval} onChange={event => setPolicy({ ...policy, require_two_person_redirect_approval: event.target.checked })} />Require two-person redirect approval</label>
    <button type="button" disabled={busy || !domain} onClick={() => void save()} className="mt-4 rounded bg-accent px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">{busy ? "Saving…" : "Save governance policy"}</button>
    {status && <p role="status" className="mt-2 text-xs text-text-secondary">{status}</p>}
  </section>;
}
