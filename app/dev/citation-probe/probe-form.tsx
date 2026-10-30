"use client";

import { useActionState } from "react";
import { probeCitationAction } from "./actions";
import type { MockAudit } from "@/lib/mock-audit";
import type { SavedMockAudit } from "@/lib/mock-audit-store";

function SaveReport({ report, state, action, pending }: { report: MockAudit; state: { saved: SavedMockAudit | null; error: string | null }; action: (formData: FormData) => void; pending: boolean }) {
  return <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
    <h2 className="text-lg font-semibold">Save this demo to Supabase</h2>
    <p className="text-sm text-zinc-600">Creates one audit and {report.brokenLinks.length} broken-link rows, then reads them back. Citations stay in this preview; the current schema stores audit and broken-link fields only.</p>
    <form action={action}>
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="domain" value={report.domain} />
      <input type="hidden" name="prompt" value={report.prompt} />
      <button disabled={pending || !!state.saved} className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{pending ? "Saving and verifying..." : state.saved ? "Saved to Supabase" : "Save mock audit"}</button>
    </form>
    {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    {state.saved && <div role="status" className="space-y-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
      <p className="font-semibold">Saved and read back from Supabase</p>
      <p className="break-all">Audit ID: {state.saved.id}</p>
      <p>{state.saved.domain} / {state.saved.status} / {state.saved.broken_links.length} linked rows</p>
      <time dateTime={state.saved.created_at}>{state.saved.created_at}</time>
    </div>}
  </section>;
}

export default function ProbeForm() {
  const [state, action, pending] = useActionState(probeCitationAction, { result: null, saved: null, error: null });
  const report = state.result;
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl space-y-7 px-5 py-10 sm:px-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Citemend / Day 3</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Citation audit workspace</h1>
          <p className="max-w-2xl text-zinc-600">Preview sample citations, review simulated broken links, and save a demo audit to your database.</p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Mock mode: all findings are generated from a fixed fixture. No Gemini requests, Google searches, or HTTP scans are made.</p>
        </header>
        <form action={action} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
          <label className="block text-sm font-medium" htmlFor="domain">Domain
            <input id="domain" name="domain" required maxLength={253} defaultValue="example.com" className="mt-2 block w-full rounded-lg border border-zinc-300 p-3" />
          </label>
          <label className="block text-sm font-medium" htmlFor="prompt">Research prompt
            <textarea id="prompt" name="prompt" required maxLength={4000} defaultValue="Find documentation citations and suggested replacement URLs." className="mt-2 block min-h-24 w-full rounded-lg border border-zinc-300 p-3" />
          </label>
          <p className="text-xs text-zinc-500">The domain personalizes sample URLs. The prompt is retained for the preview; it does not change the fixed mock findings.</p>
          <button disabled={pending} className="rounded-lg bg-emerald-700 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">{pending ? "Preparing preview..." : "Generate mock audit"}</button>
        </form>
        {state.error && !report && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{state.error}</p>}
        {!report && <p className="py-8 text-center text-zinc-500">Your sample report will appear here. Nothing is saved until you choose Save mock audit.</p>}
        {report && <div aria-live="polite" className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {[["Demo citations", report.sources.length], ["Simulated 404s", report.brokenLinks.length], ["Mode", "Mock data"]].map(([label, value]) => <div key={label} className="rounded-xl border border-zinc-200 bg-white p-5"><p className="text-sm text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
          </div>
          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Sample citations for {report.domain}</h2>
            <p className="text-sm text-zinc-600">{report.text}</p>
            <div className="grid gap-3 sm:grid-cols-3">{report.sources.map((source) => <div key={source.index} className="min-w-0 rounded-lg border border-zinc-200 p-4"><p className="text-xs font-medium text-emerald-700">Sample source {source.index + 1}</p><h3 className="mt-2 text-sm font-semibold">{source.title}</h3><p className="mt-2 break-all text-xs text-zinc-500">{source.url}</p></div>)}</div>
            <ul className="space-y-2 text-sm text-zinc-600">{report.citations.map((citation) => <li key={citation.text}>{citation.text} <span className="font-medium text-emerald-700">[{citation.sourceIndices.map((index) => index + 1).join(", ")}]</span></li>)}</ul>
          </section>
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Simulated broken links</h2>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-zinc-500"><tr><th className="p-3">Cited URL</th><th className="p-3">Mock status</th><th className="p-3">Suggested redirect</th></tr></thead><tbody>{report.brokenLinks.map((link) => <tr key={link.citedUrl} className="border-b last:border-0"><td className="min-w-48 break-all p-3">{link.citedUrl}</td><td className="p-3"><span className="rounded bg-red-50 px-2 py-1 font-medium text-red-700">{link.httpStatus}</span></td><td className="min-w-48 break-all p-3">{link.suggestedRedirect}</td></tr>)}</tbody></table></div>
          </section>
          <SaveReport report={report} state={state} action={action} pending={pending} />
          <details className="rounded-xl border border-zinc-200 bg-white p-5"><summary className="cursor-pointer text-sm font-medium">Mock response JSON</summary><pre className="mt-4 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(report, null, 2)}</pre></details>
        </div>}
      </div>
    </main>
  );
}
