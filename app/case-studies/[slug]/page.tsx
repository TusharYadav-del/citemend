import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerDatabase } from "@/lib/supabase-server";
import type { CaseStudy } from "@/lib/case-study-builder";

export const instant = false;
export const metadata: Metadata = { title: "Verified Recovery Case Study | CiteMend", robots: { index: false, follow: false } };

function isCaseStudy(value: unknown): value is CaseStudy {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CaseStudy>;
  return typeof row.title === "string" && typeof row.workspaceLabel === "string" && !!row.baselineProblem && !!row.recoveryAction && !!row.verifiedOutcome && Array.isArray(row.observableEvidence) && Array.isArray(row.evidenceLimits);
}
function dateLabel(value: string | null) { if (!value || !Number.isFinite(Date.parse(value))) return "Not observed"; return new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"; }

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^cs_[a-f0-9]{32}$/.test(slug)) notFound();
  let result;
  try { result = await createServerDatabase().from("case_studies").select("study_json,created_at").eq("slug", slug).eq("is_public", true).maybeSingle(); }
  catch { notFound(); }
  if (result.error || !result.data || !isCaseStudy(result.data.study_json)) notFound();
  const study = result.data.study_json;
  const color = /^#[0-9a-f]{6}$/i.test(study.brandColor) ? study.brandColor : "#37F5A0";
  const outcomeCards = [
    { label: "Technical deployment", value: study.verifiedOutcome.technicalDeploymentVerified ? `Verified · ${dateLabel(study.verifiedOutcome.technicalVerifiedAt)}` : "Not technically verified in this record" },
    { label: "Later AI citation", value: study.verifiedOutcome.laterAiCitationObserved ? `Observed · ${dateLabel(study.verifiedOutcome.aiCitationObservedAt)}` : "Not observed in this record" },
    { label: "Rescued AI visits", value: study.verifiedOutcome.measuredRescuedAiVisits.toLocaleString() },
    { label: "Estimated pipeline", value: study.verifiedOutcome.estimatedPipelineUsd === null ? "Not estimated" : `Estimated $${study.verifiedOutcome.estimatedPipelineUsd.toLocaleString()} USD` },
  ];
  return <main className="min-h-screen bg-[#07090E] px-5 py-12 text-[#F5F7FA] sm:px-8 sm:py-16"><article className="mx-auto max-w-4xl">
    <p className="font-mono text-[10px] uppercase tracking-[.18em]" style={{ color }}>{study.brandName} · Verified recovery case study</p>
    <h1 className="mt-4 text-3xl font-semibold tracking-[-.05em] sm:text-5xl">{study.title}</h1>
    <p className="mt-3 text-sm text-slate-400">Workspace: <span className="font-mono text-slate-300">{study.workspaceLabel}</span> · Created {dateLabel(result.data.created_at)}</p>
    <section className="mt-8 grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-rose-300/20 bg-rose-300/[.035] p-5"><h2 className="text-sm font-semibold text-rose-100">Before · baseline problem</h2><p className="mt-3 text-sm leading-6 text-slate-300">{study.baselineProblem.description}</p>{study.baselineProblem.sourceUrl && <p className="mt-2 break-all font-mono text-xs text-slate-400">{study.baselineProblem.sourceUrl}</p>}{study.baselineProblem.observedStatus !== null && <p className="mt-2 font-mono text-xs text-rose-200">Saved HTTP status: {study.baselineProblem.observedStatus}</p>}</div><div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[.035] p-5"><h2 className="text-sm font-semibold text-emerald-100">After · recovery action</h2><p className="mt-3 text-sm font-medium text-slate-200">{study.recoveryAction.label}</p>{study.recoveryAction.destinationUrl && <p className="mt-2 break-all font-mono text-xs text-slate-400">Destination: {study.recoveryAction.destinationUrl}</p>}<p className="mt-2 text-xs text-slate-500">Recorded: {dateLabel(study.recoveryAction.recordedAt)}</p><p className="mt-3 text-xs text-slate-400">Time to first saved recovery signal: {study.timeToRecoveryMinutes === null ? "Not available" : `${study.timeToRecoveryMinutes} minutes`}</p></div></section>
    {study.buyerPrompt && <section className="mt-4 rounded-xl border border-white/10 bg-white/[.025] p-5"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Buyer-intent prompt</h2><p className="mt-2 text-sm text-slate-200">{study.buyerPrompt}</p></section>}
    <section className="mt-4 rounded-xl border border-white/10 bg-white/[.025] p-5"><h2 className="text-sm font-semibold text-white">Observable evidence</h2><ul className="mt-3 space-y-2">{study.observableEvidence.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2 text-sm leading-6 text-slate-300"><span className="text-emerald-300">•</span><span>{item}</span></li>)}</ul></section>
    <section className="mt-4 rounded-xl border border-white/10 bg-white/[.025] p-5"><h2 className="text-sm font-semibold text-white">Verified outcome</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{outcomeCards.map((item) => <div key={item.label} className="rounded-lg border border-white/[.07] bg-black/10 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">{item.label}</p><p className="mt-1 text-sm font-medium text-slate-200">{item.value}</p></div>)}</div><p className="mt-4 text-xs leading-5 text-slate-400">{study.verifiedOutcome.estimateDisclosure}</p></section>
    <aside className="mt-5 rounded-lg border border-amber-300/15 bg-amber-300/[.035] p-4"><h2 className="text-xs font-semibold text-amber-100">How to read this report</h2><ul className="mt-2 space-y-1 text-[11px] leading-5 text-slate-400">{study.evidenceLimits.map((item) => <li key={item}>• {item}</li>)}</ul></aside>
    <footer className="mt-8 border-t border-white/[.08] pt-4 text-[10px] text-slate-600">CiteMend · Evidence-backed recovery proof · A technical redirect and later AI citation are distinct milestones.</footer>
  </article></main>;
}
