import { calculateWorkspaceOperatingMetrics } from "@/lib/operating-metrics";

type Metrics = ReturnType<typeof calculateWorkspaceOperatingMetrics>;

function minutes(value: number | null) { return value === null ? "Not measured" : `${value.toFixed(1)} min`; }
function rate(value: number | null) { return value === null ? "No actions yet" : `${value.toFixed(1)}%`; }
function usd(value: number | null | undefined) { return value === null || value === undefined ? "n/a" : `$${value.toFixed(3)}`; }

export function OperatingMetricsPanel({ domain, metrics }: { domain: string; metrics: Metrics | null }) {
  if (!domain) return <section aria-label="Operating metrics" className="mb-5 rounded-xl border border-white/10 bg-white/[.02] p-4"><h2 className="text-sm font-semibold">Operating metrics</h2><p className="mt-2 text-xs text-slate-400">Run an audit to begin workspace measurement.</p></section>;
  const margin = metrics?.gross_margin_estimate;
  const marginDetail = margin ? `${margin.tier} plan ${usd(margin.monthly_plan_price_usd)}/mo; estimated scan ${usd(margin.estimated_monthly_scan_api_cost_usd)}/mo (${usd(margin.estimated_cost_per_audit_usd)}/audit)` : "Plan cost data unavailable";
  return <section aria-label="Operating metrics and unit economics" className="mb-5 rounded-xl border border-white/10 bg-white/[.02] p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">Operating metrics | {domain}</h2><p className="mt-1 text-xs text-slate-400">Targets are service goals; shown results are measured evidence or explicitly labeled estimates.</p></div><span className="rounded-full border border-emerald-300/20 px-2.5 py-1 text-[10px] text-emerald-200">{metrics?.customer_activation.activated ? "Activated" : "Awaiting first completed audit"}</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Metric label="Time to first useful audit" value={minutes(metrics?.time_to_first_useful_audit_minutes ?? null)} target="Target < 15 min" met={metrics?.time_to_first_useful_audit_target_met ?? false} />
      <Metric label="Time to first recovery action" value={minutes(metrics?.time_to_first_recovery_action_minutes ?? null)} target="Target < 30 min" met={metrics?.time_to_first_recovery_action_target_met ?? false} />
      <Metric label="Redirect deployment verification" value={rate(metrics?.redirect_deployment_verification_rate_percent ?? null)} target={`${metrics?.redirect_deployment_actions_verified ?? 0} of ${metrics?.redirect_deployment_actions ?? 0} deployments`} met={metrics?.redirect_deployment_verification_rate_percent === 100} />
      <Metric label="Evidence completeness" value={rate(metrics?.evidence_completeness_rate_percent ?? null)} target={`${metrics?.verified_outcomes_with_complete_evidence ?? 0} of ${metrics?.verified_outcomes ?? 0} verified outcomes`} met={metrics?.evidence_completeness_rate_percent === 100} />
      <Metric label="Activation milestone" value={metrics?.customer_activation.first_recovery_action_completed ? "Audit + recovery" : metrics?.customer_activation.activated ? "First useful audit" : "Not activated"} target="Activation = first completed audit" met={metrics?.customer_activation.activated ?? false} />
      <Metric label="Estimated gross margin" value={margin?.estimated_gross_margin_percent === null || margin?.estimated_gross_margin_percent === undefined ? "Not available for this plan" : `${margin.estimated_gross_margin_percent.toFixed(1)}%`} target={`75% target | ${marginDetail}`} met={margin?.target_met ?? false} />
    </div>
    <p className="mt-3 text-[10px] leading-5 text-slate-500">{metrics?.workspace_creation_measurement ?? "Workspace start is measured from the first valid audit submission because this app has no separate workspace creation event."} Gross margin is an estimate excluding infrastructure, payment fees, and unrecorded provider usage.{margin?.unconfigured_model_costs.length ? ` Configure per-call model cost assumptions for: ${margin.unconfigured_model_costs.join(", ")}.` : ""}</p>
  </section>;
}

function Metric({ label, value, target, met }: { label: string; value: string; target: string; met: boolean }) {
  return <div className="rounded-lg border border-white/10 bg-black/15 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-100">{value}</p><p className={`mt-1 text-[10px] ${met ? "text-emerald-300" : "text-slate-500"}`}>{target}</p></div>;
}
