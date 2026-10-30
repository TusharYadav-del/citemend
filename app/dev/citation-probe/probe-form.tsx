"use client";

import { useActionState } from "react";
import { probeCitationAction } from "./actions";

export default function ProbeForm() {
  const [state, action, pending] = useActionState(probeCitationAction, { result: null, error: null });
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Gemini citation probe</h1>
      <p>Test Gemini 3.8 Flash with Google Search grounding. This does not scan URLs or save an audit.</p>
      <form action={action} className="space-y-4">
        <label className="block">Domain
          <input name="domain" required maxLength={253} defaultValue="nextjs.org" className="block w-full rounded border p-2" />
        </label>
        <label className="block">Prompt
          <textarea name="prompt" required maxLength={4000} defaultValue="Search for the official Next.js installation guide and summarize its requirements with citations." className="block min-h-28 w-full rounded border p-2" />
        </label>
        <button disabled={pending} className="rounded border px-4 py-2 disabled:opacity-50">{pending ? "Probing..." : "Run citation probe"}</button>
      </form>
      {state.error && <p role="alert">{state.error}</p>}
      {state.result && <section aria-live="polite" className="space-y-4">
        <h2 className="text-xl font-semibold">Probe result</h2>
        <p>{state.result.sources.length} source(s), {state.result.citations.length} citation segment(s).</p>
        {!state.result.sources.length && <p>Google Search was enabled, but Gemini returned no web sources for this request.</p>}
        <pre className="overflow-auto whitespace-pre-wrap break-words rounded border p-4">{JSON.stringify(state.result, null, 2)}</pre>
      </section>}
    </main>
  );
}
