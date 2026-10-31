import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPublicAudit } from "@/lib/public-audit";
import CopyRedirects from "@/components/copy-redirects";

export const metadata: Metadata = {
  title: "Citation audit report | CiteFix AI",
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
    return <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-8"><h1 className="text-2xl font-semibold">Report temporarily unavailable</h1><p className="mt-3 text-sm leading-6">We could not retrieve this report. Please reload this link in a moment.</p></section>;
  }
  if (!audit) notFound();
  const mock = audit.status === "mock_completed";
  const partial = audit.status === "partial";
  const redirects = audit.broken_links.filter((link) => link.suggested_redirect).length;

  return (
    <>
      <aside className="rounded-2xl bg-[#214d39] p-6 text-white sm:p-8">
        <p className="break-words text-lg font-semibold">Prepared for {audit.domain} by CiteFix AI.</p>
        <p className="mt-2 text-sm leading-6 text-[#dfebd7]">Claim this domain to unlock automated weekly monitoring.</p>
        <Link href="/#audit" className="mt-5 inline-flex rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#214d39]">Get started with CiteFix AI &rarr;</Link>
        <p className="mt-3 text-xs leading-5 text-[#dfebd7]">Sign in to run audits and view your workspace. Domain claiming is coming soon; weekly scans require Pro and an active schedule.</p>
      </aside>
      <header className="my-10">
        <p className="text-xs font-semibold tracking-widest text-[#53704e]">EXECUTIVE CITATION REPORT</p>
        <h1 className="mt-3 break-all text-3xl font-semibold tracking-tight sm:text-4xl">{audit.domain}</h1>
        <p className="mt-3 text-sm text-[#68736b]">Audit recorded <time dateTime={audit.created_at}>{new Date(audit.created_at).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC</time></p>
        <p className="mt-2 text-xs text-[#68736b]">Status: {mock ? "Simulated sample" : partial ? "Partial audit" : "Completed audit"}</p>
      </header>
      {(partial || mock) && <p role="note" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{mock ? "This report contains simulated findings for demonstration. These are not live HTTP checks." : "This audit was only partially completed. Findings may be incomplete; detailed run warnings were not stored."}</p>}
      <section aria-label="Audit summary" className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[#dfe5dc] bg-white p-6"><p className="text-sm text-[#68736b]">{mock ? "Simulated 404 links" : "Confirmed HTTP 404 links"}</p><p className="mt-3 text-4xl font-semibold">{audit.broken_links.length}</p></div>
        <div className="rounded-xl border border-[#dfe5dc] bg-white p-6"><p className="text-sm text-[#68736b]">Suggested redirect destinations</p><p className="mt-3 text-4xl font-semibold">{redirects}</p></div>
      </section>
      <section className="rounded-2xl border border-[#dfe5dc] bg-white p-5 sm:p-8">
        <h2 className="text-xl font-semibold">Broken citations and recovery opportunities</h2>
        <p className="mt-3 text-sm leading-6 text-[#68736b]">Broken citation destinations can interrupt a prospect&apos;s journey. Review each suggested destination before configuring a redirect.</p>
        {audit.broken_links.length ? <ol className="mt-6 space-y-4">{audit.broken_links.map((link, index) => <li key={link.id} className="rounded-xl border border-[#e5e9e0] bg-[#f7f8f4] p-5"><h3 className="text-sm font-semibold">Citation {index + 1} <span className="ml-2 text-red-700">HTTP 404</span></h3><p className="mt-3 break-all text-sm">{link.cited_url}</p><p className="mt-4 text-xs font-semibold text-[#53704e]">Suggested destination</p><p className="mt-2 break-all text-sm">{link.suggested_redirect ?? "No verified replacement saved. Review this destination manually."}</p></li>)}</ol> : <p className="mt-6 rounded-xl bg-[#f1f6eb] p-5 text-sm leading-6">No confirmed HTTP 404 links were saved for this audit. This does not establish that every page or citation is healthy.</p>}
      </section>
      <CopyRedirects domain={audit.domain} links={audit.broken_links} />
      <footer className="mt-8 space-y-2 text-xs leading-5 text-[#68736b]"><p>This is a saved snapshot, not a live status check. Only the audit summary and saved 404 findings are available; total citations and health scores were not stored.</p><p>Anyone with this report link can view it.</p></footer>
    </>
  );
}

export default function PublicAuditPage({ params }: { params: Promise<{ id: string }> }) {
  return <main className="min-h-screen bg-[#f7f8f4] px-5 py-8 text-[#182c25] sm:px-8 sm:py-12"><div className="mx-auto max-w-4xl"><Suspense fallback={<p role="status" className="py-12 text-sm">Loading audit report...</p>}><AuditReport params={params} /></Suspense></div></main>;
}
