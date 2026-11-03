import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPublicAudit } from "@/lib/public-audit";
import SavedCitationGaps from "@/components/saved-citation-gaps";
import CopyRedirects from "@/components/copy-redirects";
import VerifyFixButton from "@/components/VerifyFixButton";
import { ENGINE_PROFILES, type EngineMatrixRow } from "@/lib/engine-matrix";

export const metadata: Metadata = {
  title: "Citation audit report | Citemend AI",
  description: "A shareable report of saved broken AI citations and suggested redirects.",
  robots: { index: false, follow: false },
};

async function AuditReport({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  let audit: Awaited<ReturnType<typeof getPublicAudit>>;
  try {
    audit = await getPublicAudit(id);
  } catch {
    return <section role="alert" className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-8 text-amber-100"><h1 className="text-2xl font-semibold">Report temporarily unavailable</h1><p className="mt-3 text-sm leading-6">We could not retrieve this report. Please reload this link in a moment.</p></section>;
  }
  if (!audit) notFound();
  const mock = audit.status === "mock_completed";
  const partial = audit.status === "partial";
  const redirects = audit.broken_links.filter((link) => link.suggested_redirect).length;

  return (
    <>
      <aside className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-6 text-white sm:p-8">
        <p className="break-words text-lg font-semibold">Prepared for {audit.domain} by Citemend AI.</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">Claim this domain to unlock automated weekly monitoring.</p>
        <Link href="/#audit" className="mt-5 inline-flex rounded-lg bg-emerald-400 px-5 py-3 text-sm font-semibold text-[#07110d]">Get started with Citemend AI &rarr;</Link>
        <p className="mt-3 text-xs leading-5 text-slate-400">Sign in to run audits and view your workspace. Domain claiming is coming soon; weekly scans require Pro and an active schedule.</p>
      </aside>
      <header className="my-10">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">EXECUTIVE CITATION REPORT</p>
        <h1 className="mt-3 break-all text-3xl font-semibold tracking-tight text-white sm:text-4xl">{audit.domain}</h1>
        <p className="mt-3 text-sm text-slate-400">Audit recorded <time dateTime={audit.created_at}>{new Date(audit.created_at).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC</time></p>
        <p className="mt-2 text-xs text-slate-500">Status: {mock ? "Simulated sample" : partial ? "Partial audit" : "Completed audit"}</p>
      </header>
      {(partial || mock) && <p role="note" className="mb-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-200">{mock ? "This report contains simulated findings for demonstration. These are not live HTTP checks." : "This audit was only partially completed. Findings may be incomplete; detailed run warnings were not stored."}</p>}
      <section aria-label="Audit summary" className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6"><p className="text-sm text-slate-400">{mock ? "Simulated 404 links" : "Confirmed HTTP 404 links"}</p><p className="mt-3 text-4xl font-semibold text-white">{audit.broken_links.length}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6"><p className="text-sm text-slate-400">Suggested redirect destinations</p><p className="mt-3 text-4xl font-semibold text-white">{redirects}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6"><p className="text-sm text-slate-400">Share of Model (SoM %)</p><p className="mt-3 text-4xl font-semibold text-white">{audit.share_of_model_score ?? 0}%</p></div>
      </section>
      {Array.isArray(audit.engine_matrix_json) && audit.engine_matrix_json.length > 0 && <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8" aria-label="Multi-engine citation matrix"><h2 className="text-xl font-semibold text-white">Multi-Engine Citation Matrix <span className="text-slate-400">· Buyer Prompt Breakdown</span></h2><p className="mt-2 text-sm text-slate-400">Shared live search grounding is shown through four synthesis profiles; results are not independent engine API observations.</p><div className="mt-5 space-y-4">{[...new Set((audit.engine_matrix_json as EngineMatrixRow[]).map(row => row.prompt))].map(prompt => <article key={prompt} className="rounded-xl border border-white/10 bg-black/20 p-4"><h3 className="text-sm font-semibold text-white">{prompt}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{ENGINE_PROFILES.map(engine => { const row = (audit.engine_matrix_json as EngineMatrixRow[]).find(item => item.prompt === prompt && item.engine === engine); if (!row) return null; const label = row.status === "cited_rank_1" ? "✅ Cited #1" : row.status === "cited_rank_2_plus" ? "✅ Cited #2+" : row.status === "cited_dead_404_slug" ? "⚠️ Dead 404 slug" : row.status === "cited_reddit_thread" ? "❌ Cited Reddit thread" : `❌ Omitted (Cited ${row.competitor ?? "Competitor"})`; return <div key={engine} className="rounded-lg border border-white/5 p-3"><p className="text-xs font-medium text-slate-300">{engine}</p><p className="mt-1 text-sm text-slate-200">{label}</p>{row.citedUrl && <a className="mt-2 block break-all text-xs text-emerald-300 hover:underline" href={row.citedUrl} target="_blank" rel="noreferrer">{row.citedUrl}</a>}</div>; })}</div><div className="mt-3 flex flex-wrap gap-2 text-xs"><Link href="/#audit" className="rounded border border-emerald-400/20 px-2 py-1 text-emerald-300">⚡ Generate Capsule to Win Engine</Link><Link href="/dashboard/pixel" className="rounded border border-white/10 px-2 py-1 text-slate-300">🛠️ View Active 301 Recovery</Link><a href="#report-opportunities" className="rounded border border-white/10 px-2 py-1 text-slate-300">🔥 View Reddit Source Thread</a></div></article>)}</div></section>}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8">
        <h2 className="text-xl font-semibold text-white">Broken citations and recovery opportunities</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">Broken citation destinations can interrupt a prospect&apos;s journey. Review each suggested destination before configuring a redirect.</p>
        {audit.broken_links.length ? <ol className="mt-6 space-y-4">{audit.broken_links.map((link, index) => <li key={link.id} className="rounded-xl border border-white/10 bg-black/20 p-5"><h3 className="text-sm font-semibold text-white">Citation {index + 1} <span className="ml-2 text-rose-300">HTTP 404</span></h3><p className="mt-3 break-all text-sm text-slate-300">{link.cited_url}</p><p className="mt-4 text-xs font-semibold text-emerald-300">Suggested destination</p><p className="mt-2 break-all text-sm text-slate-300">{link.suggested_redirect ?? "No verified replacement saved. Review this destination manually."}</p>{link.suggested_redirect && <VerifyFixButton auditId={audit.id} brokenLinkId={link.id} />}</li>)}</ol> : <p className="mt-6 rounded-xl bg-emerald-400/5 p-5 text-sm leading-6 text-slate-300">No confirmed HTTP 404 links were saved for this audit. This does not establish that every page or citation is healthy.</p>}
      </section>
      <SavedCitationGaps auditId={audit.id} domain={audit.domain} />
      <CopyRedirects domain={audit.domain} links={audit.broken_links} />
      <footer className="mt-8 space-y-2 text-xs leading-5 text-slate-500"><p>This is a saved snapshot, not a live status check. Only the audit summary and saved 404 findings are available; total citations and health scores were not stored.</p><p>Anyone with this report link can view it.</p></footer>
    </>
  );
}

export default function PublicAuditPage({ params }: { params: Promise<{ id: string }> }) {
  return <main className="min-h-screen bg-[#07090E] text-slate-100"><div className="mx-auto flex min-h-screen max-w-[1600px]"><aside className="hidden w-64 shrink-0 border-r border-white/10 bg-black/20 px-5 py-8 lg:block"><Link href="/dashboard" className="text-sm font-bold tracking-wide text-white">CITEMEND <span className="text-emerald-400">/ COMMAND</span></Link><nav aria-label="Main navigation" className="mt-10 space-y-1 text-sm"><Link href="/dashboard" className="block rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">Dashboard</Link><Link href="/dashboard/pixel" className="block rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">404 Interceptor</Link><a href="#report-opportunities" className="block rounded-lg bg-emerald-400/10 px-3 py-2.5 font-semibold text-emerald-300">Citation Hijacker</a><a href="#citation-gaps" className="block rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">Citation Capsule</a><Link href="/dashboard#llms-txt-generator" className="block rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">llms.txt &amp; Facts</Link><Link href="/dashboard#settings" className="block rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">Settings</Link></nav><div className="mt-12 rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-xs text-slate-400"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />Report snapshot</div></aside><div id="report-opportunities" className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12"><Suspense fallback={<p role="status" className="py-12 text-sm text-slate-400">Loading audit report...</p>}><AuditReport params={params} /></Suspense></div></div></main>;
}
