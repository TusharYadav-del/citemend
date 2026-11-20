"use client";

import { useState } from "react";
import { toast } from "sonner";

export default function ScheduledReportSettings({ domain }: { domain: string }) {
  const [email, setEmail] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [recurrenceInterval, setRecurrenceInterval] = useState("weekly");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    const recipient = email.trim();
    const parsed = Date.parse(scheduleAt);
    if (!domain) { setStatus("Select a connected workspace first."); return; }
    if (!recipient) { setStatus("Enter a report recipient email."); return; }
    if (!Number.isFinite(parsed) || parsed <= Date.now()) { setStatus("Choose a valid future schedule time."); return; }
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/reports/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, email: recipient, scheduleAt: new Date(parsed).toISOString(), reportType: "weekly_summary", recurrenceInterval }) });
      const result = await response.json().catch(() => null) as { error?: unknown } | null;
      if (!response.ok) throw new Error(result?.error === "blocked_by_outbound_lock" ? "Outbound email is disabled by the workspace safety lock." : typeof result?.error === "string" ? result.error : "Could not schedule report.");
      setStatus("Scheduled report saved."); toast.success("Scheduled report saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not schedule report.";
      setStatus(message); toast.error(message);
    } finally { setBusy(false); }
  }

  return <section className="mb-5 rounded-xl border border-border bg-surface-raised p-4">
    <h2 className="text-sm font-semibold">Scheduled email reports</h2>
    <p className="mt-1 text-xs text-text-secondary">Send reports once, weekly, biweekly, or monthly. Dispatch follows the outbound email hard lock.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <input type="email" aria-label="Report recipient email" placeholder="you@company.com" value={email} onChange={event => setEmail(event.target.value)} className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm" />
      <input type="datetime-local" aria-label="Report schedule time" value={scheduleAt} onChange={event => setScheduleAt(event.target.value)} className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm" />
      <select aria-label="Report recurrence" value={recurrenceInterval} onChange={event => setRecurrenceInterval(event.target.value)} className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"><option value="one_time">One time</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option></select>
      <button type="button" onClick={() => void save()} disabled={busy || !email.trim() || !scheduleAt || !domain} className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-black disabled:opacity-50">{busy ? "Scheduling…" : "Schedule report"}</button>
      {status && <span role="status" className="self-center text-xs text-text-secondary">{status}</span>}
    </div>
  </section>;
}
