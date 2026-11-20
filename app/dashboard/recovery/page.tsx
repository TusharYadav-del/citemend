import Link from "next/link";
import { getDashboardPageData } from "@/lib/dashboard-page-data";
import { RecoveryDeploymentTools } from "@/components/recovery-deployment-tools";
import { RecoveryExportActions } from "@/components/recovery-export-actions";
import { RecoveryCenter, type RecoveryEvidence, type RecoveryOutcome, type RecoveryLog } from "@/components/recovery-center";
import { canWorkspace } from "@/lib/rbac";
import { hasProSubscription } from "@/lib/subscription";

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<{ domain?: string; recovery?: string }> }) {
  const params = await searchParams; const data = await getDashboardPageData(params.domain);
  const audits = data.domain ? data.audits.filter(audit => audit.domain === data.domain) : data.audits;
  const rows = audits.flatMap(audit => audit.broken_links.map(link => ({ ...link, auditId: audit.id, domain: audit.domain, auditCreatedAt: audit.created_at })));
  const ids = audits.map(audit => audit.id);
  let evidence: RecoveryEvidence[] = []; let outcomes: RecoveryOutcome[] = []; let logs: RecoveryLog[] = []; let evidenceError = false;
  let findings: { id: string; domain: string; normalized_path: string; suggested_target_url: string | null; approval_status: string; guardrail_classification: string }[] = [];
  let activeRules: string[] = []; let syncedLinks: string[] = []; let destinationRequestsServed: Record<string, number> = {};
  if (ids.length) {
    const [e, o, f, r, l] = await Promise.all([
      data.db.from("ai_observation_evidence").select("id,audit_id,domain,prompt_query,prompt_version,provider,model_name,search_method,locale,raw_answer,extracted_urls_json,sample_size,observed_at").in("audit_id", ids).order("observed_at", { ascending: false }).limit(500),
      data.db.from("recovery_outcomes").select("audit_id,broken_link_id,technical_deployment_verified_at,ai_citation_observed_at").in("audit_id", ids).limit(500),
      data.db.from("recovery_findings").select("id,domain,normalized_path,suggested_target_url,approval_status,guardrail_classification").in("audit_id", ids).limit(500),
      data.db.from("redirect_rules").select("source_host,source_path,target_url,synced_to_cms,source_link_id,hits_recovered").in("user_id", data.ownerUserIds).eq("active", true).eq("is_active", true).limit(500),
      data.db.from("action_audit_logs").select("id,workspace_domain,actor_user_id,action_type,target_url,safety_check_passed,created_at").in("workspace_domain", [data.domain]).eq("actor_user_id", data.session.userId).order("created_at", { ascending: false }).limit(200),
    ]);
    evidence = e.data ?? []; outcomes = o.data ?? []; findings = f.data ?? []; logs = l.data ?? []; evidenceError = !!e.error || !!o.error;
    const rules = (r.data ?? []).filter(rule => rule.source_host === data.domain);
    activeRules = rules.map(rule => `${rule.source_host}:${rule.source_path}`);
    syncedLinks = rules.filter(rule => rule.synced_to_cms && rule.source_link_id).map(rule => rule.source_link_id!);
    destinationRequestsServed = Object.fromEntries(rules.filter(rule => rule.source_link_id).map(rule => [rule.source_link_id!, rule.hits_recovered ?? 0]));
  }
  const latestAudit = audits[0]; const isPro = await hasProSubscription(data.ownerUserIds[0]).catch(() => null);
  return <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Defend / recovery</p><h2 className="mt-1 text-2xl font-semibold">Recovery Center</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">Review owned dead URLs and third-party broken citations. Soft-404, redirect-loop, and destination checks stay in force; deployment requires human approval.</p>
    <div className="mt-5 flex flex-wrap items-center gap-2"><RecoveryExportActions domain={data.domain} /><Link href="/dashboard/settings" className="rounded-md border border-border px-3 py-2 text-xs text-foreground">Shopify integration settings</Link></div>
    {!rows.length && <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-sm text-text-secondary">No recovery evidence is available for this workspace yet. Run an audit to discover candidates.</p>}
    <RecoveryCenter rows={rows} evidence={evidence} outcomes={outcomes} logs={logs} canApprove={canWorkspace(data.access.role, "approve_redirect")} isPro={isPro} activeRules={activeRules} syncedLinks={syncedLinks} pendingOnly={params.recovery === "pending"} evidenceError={evidenceError} destinationRequestsServed={destinationRequestsServed} auditId={latestAudit?.id} workspaceDomain={data.domain} />
    <div className="mt-6"><RecoveryDeploymentTools domain={data.domain} findings={findings} /></div>
    <div className="mt-4 rounded-lg border border-warning/20 bg-warning/5 p-4 text-xs leading-5 text-text-secondary"><strong className="text-foreground">Safety guardrails:</strong> Soft-404s and low-confidence mappings remain in review; HTTP failures can be transient; only reviewed equivalent pages should receive redirects. Historical Wayback context is shown when available on each finding.</div>
  </div>;
}
