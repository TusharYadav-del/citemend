import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { AgencyReportCTA } from "@/components/agency-report-brand";
import { MonthlyRoiReportSwitcher } from "@/components/monthly-roi-report-switcher";
import PrintReportButton from "@/components/print-report-button";
import { getUserAuditHistory } from "@/lib/audit-history";
import { getAgencyProfile } from "@/lib/agency-store";
import { currentReportMonth, parseReportMonth } from "@/lib/monthly-roi-report";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { createServerDatabase } from "@/lib/supabase-server";

type Props = { searchParams: Promise<{ domain?: string | string[]; month?: string | string[] }> };

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p><p className="mt-2 text-xs leading-5 text-slate-600">{note}</p></article>;
}

export default async function MonthlyRoiReportPage({ searchParams }: Props) {
  const session = await auth();
  if (!session.userId) redirect("/");
  const db = createServerDatabase();
  let access;
  try { access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null); }
  catch { notFound(); }

  let audits;
  try { audits = await getUserAuditHistory(session.userId, access.ownerUserIds); }
  catch { notFound(); }
  const completedAudits = audits.filter(audit => ["completed", "partial", "mock_completed"].includes(audit.status));
  const domains = [...new Set(completedAudits.map(audit => audit.domain))].sort();
  const params = await searchParams;
  const requestedDomain = Array.isArray(params.domain) ? params.domain[0] : params.domain;
  const domain = requestedDomain && domains.includes(requestedDomain) ? requestedDomain : domains.length === 1 ? domains[0] : "";
  if (!domain) notFound();
  const monthInput = Array.isArray(params.month) ? params.month[0] : params.month;
  const month = monthInput ? parseReportMonth(monthInput) : currentReportMonth();
  if (!month) notFound();

  const auditIds = completedAudits.filter(audit => audit.domain === domain).map(audit => audit.id);
  if (!auditIds.length) notFound();

  const [highIntentResult, preventedResult, handledResult, visitsResult, agency] = await Promise.all([
    db.from("recovery_findings").select("id", { count: "exact", head: true })
      .in("audit_id", auditIds).eq("domain", domain).gte("created_at", month.start).lt("created_at", month.end)
      .eq("finding_type", "dead_url").in("approval_status", ["pending_human_review", "approved"]),
    db.from("recovery_findings").select("id", { count: "exact", head: true })
      .in("audit_id", auditIds).eq("domain", domain).gte("created_at", month.start).lt("created_at", month.end)
      .or("guardrail_classification.eq.leave_as_404_or_410,approval_status.eq.rejected_bad_recommendation"),
    db.from("recovery_findings").select("id", { count: "exact", head: true })
      .in("audit_id", auditIds).eq("domain", domain).gte("created_at", month.start).lt("created_at", month.end)
      .neq("approval_status", "pending_human_review"),
    db.from("ai_404_events").select("id", { count: "exact", head: true }).eq("domain", domain)
      .gte("created_at", month.start).lt("created_at", month.end).not("redirected_to", "is", null),
    getAgencyProfile(access.ownerUserIds[0], domain).catch(() => null),
  ]);
  if (highIntentResult.error || preventedResult.error || handledResult.error || visitsResult.error) notFound();

  const handledFindings = handledResult.count ?? 0;
  const metrics = {
    highIntentErrors: highIntentResult.count ?? 0,
    recoveredVisits: visitsResult.count ?? 0,
    preventedRecommendations: preventedResult.count ?? 0,
    estimatedHoursSaved: Math.round(handledFindings * 0.25 * 100) / 100,
  };
  const brand = agency?.agency_brand_name ?? "CiteMend Recovery Report";
  const reportTitle = `${month.label} Recovery & QA Report`;

  return <main className="roi-report min-h-screen bg-[#07090E] px-4 py-8 text-slate-100 sm:px-8">
    <div className="roi-report-content mx-auto max-w-5xl">
      <div className="print-hide mb-5 flex flex-wrap items-center justify-between gap-3"><Link href={`/dashboard?domain=${encodeURIComponent(domain)}`} className="text-sm text-emerald-300">← Back to workspace</Link><PrintReportButton /></div>
      <MonthlyRoiReportSwitcher domains={domains} selectedDomain={domain} month={month.value} />
      <header className="rounded-2xl border border-white/10 bg-white/[.03] p-6 sm:p-9" style={{ borderColor: agency?.agency_primary_color ? `${agency.agency_primary_color}66` : undefined }}>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">{agency?.agency_logo_url && <Image unoptimized src={agency.agency_logo_url} alt={`${brand} logo`} width={160} height={56} className="h-14 w-auto max-w-40 object-contain" />}<div><p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-300">{brand}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{reportTitle}</h1></div></div>
          <div className="text-right text-xs text-slate-400"><p>Client workspace</p><p className="mt-1 break-all font-semibold text-slate-200">{domain}</p></div>
        </div>
        <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300">A monthly summary of verified recovery findings, observed visits through active redirects, recommendations held back by safety checks, and estimated operational time saved.</p>
      </header>
      <section className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Monthly Recovery and QA Value Summary">
        <Metric label="New Verified High-Intent Errors Caught" value={metrics.highIntentErrors.toLocaleString()} note="Dead URL findings created this month and still pending review or approved." />
        <Metric label="Post-Fix Visits & Orders Recovered" value={metrics.recoveredVisits?.toLocaleString() ?? "Unavailable"} note="Redirected recovery events observed this month. Order attribution is not connected." />
        <Metric label="Bad Recommendations & Soft-404s Prevented" value={metrics.preventedRecommendations.toLocaleString()} note="Findings left as 404/410 or explicitly rejected this month." />
        <Metric label="Engineering & SEO Hours Saved" value={`~${metrics.estimatedHoursSaved.toLocaleString()}h`} note="Estimate: 0.25 hours per finding handled this month; it is not tracked staff time." />
      </section>
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-950">Measurement notes</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5"><li>Findings are limited to completed audits for this client domain and the selected calendar month.</li><li>Recovered visits count pixel events that recorded a redirect destination during the month.</li><li>Orders and revenue are not attributed by this report.</li><li>Time saved is an estimate based on handled finding count.</li></ul>
      </section>
      <div className="mt-5"><AgencyReportCTA agency={agency} /></div>
      <footer className="mt-8 border-t border-white/10 pt-4 text-xs text-slate-500"><p>Prepared for {domain} · {month.label} · CiteMend Recovery</p></footer>
    </div>
  </main>;
}
