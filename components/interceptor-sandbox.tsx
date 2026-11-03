"use client";

import { useState } from "react";

type Result = { rescued?: boolean; redirectTo?: string; similarityScore?: number; latencyMs?: number; error?: string };

export default function InterceptorSandbox({ domain, origin }: { domain: string; origin: string }) {
  const [path, setPath] = useState("/missing-page");
  const [enabled, setEnabled] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const base = origin.replace(/\/$/, "");
  const snippet = `<script async src="${base}/citemend-pixel.js" data-domain="${domain}"></script>`;
  const worker = `// Cloudflare Worker: route traffic through this worker and configure an origin.\nexport default {\n  async fetch(request, env) {\n    const response = await fetch(request);\n    if (response.status !== 404) return response;\n    const url = new URL(request.url);\n    try {\n      const query = new URLSearchParams({ domain: url.hostname, brokenPath: url.pathname,\n        referrer: request.headers.get('referer') || '',\n        utm_source: url.searchParams.get('utm_source') || '',\n        userAgent: request.headers.get('user-agent') || '' });\n      const lookup = await fetch('${base}/api/pixel/intercept?' + query);\n      const result = await lookup.json();\n      if (result.rescued) {\n        const target = new URL(result.redirectTo);\n        if (target.protocol === 'https:' && target.hostname === url.hostname &&\n            !target.port && !target.username && !target.password && target.pathname !== url.pathname)\n          return new Response(null, { status: 301, headers: { Location: target.href, 'Cache-Control': 'private, no-store' } });\n      }\n    } catch {}\n    return response;\n  }\n};`;
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("Copied to clipboard."); }
    catch { setMessage("Select the code and copy it manually."); }
  }
  async function test() {
    setEnabled(true); setBusy(true); setResult(null); setMessage("");
    try {
      const response = await fetch("/api/pixel/intercept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, brokenPath: path, referrer: "https://chatgpt.com", forceIntercept: true, simulation: true }) });
      const data = await response.json() as Result;
      if (!response.ok) throw new Error(data.error || "The test could not be completed.");
      setResult(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The test could not be completed."); }
    finally { setBusy(false); }
  }
  return <section id="interceptor-sandbox" className="mb-8 rounded-2xl border border-[#dfe5dc] bg-white p-5 shadow-sm sm:p-6">
    <h2 className="text-xl font-semibold text-[#182c25]">404 Interceptor sandbox</h2>
    <p className="mt-2 text-sm text-[#68736b]">Install this script on your 404 page. Add <code>data-is-404=&quot;true&quot;</code> to the script if the page title does not identify the error.</p>
    <pre className="mt-4 overflow-x-auto rounded-xl bg-[#172c24] p-4 text-xs text-white"><code>{snippet}</code></pre>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!domain} onClick={() => void copy(snippet)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Copy installer</button><button type="button" disabled={!domain || busy} onClick={() => void test()} className="rounded-lg bg-[#214d39] px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Testing…" : "Test Pixel Now"}</button></div>
    <div className="mt-6 flex flex-wrap gap-2" aria-label="Sandbox mode"><button type="button" aria-pressed={!enabled} onClick={() => { setEnabled(false); setResult(null); }} className={`rounded-lg border px-3 py-2 text-sm ${!enabled ? "bg-[#eef4ed]" : ""}`}>❌ Without CiteMend</button><button type="button" aria-pressed={enabled} onClick={() => void test()} disabled={!domain || busy} className={`rounded-lg border px-3 py-2 text-sm ${enabled ? "bg-[#eef4ed]" : ""}`}>✅ With CiteMend Pixel ON</button></div>
    <label className="mt-4 block text-sm text-[#36583f]">Broken path<input value={path} onChange={event => setPath(event.target.value)} placeholder="/old-page" className="ml-3 rounded-lg border px-3 py-2" /></label>
    <p className="mt-3 break-all text-sm text-[#68736b]" role="status">{!enabled ? "Visitor remains on the 404 page." : busy ? "Checking live rescue…" : result?.rescued ? `Redirect to ${result.redirectTo} · ${result.latencyMs} ms · match score ${result.similarityScore?.toFixed(3)}` : result ? `No live match found · ${result.latencyMs ?? 0} ms` : "Choose a path and run the test."}</p>
    {message && <p role="status" className="mt-2 text-sm text-[#68736b]">{message}</p>}
    <p className="mt-2 text-xs text-[#68736b]">Sandbox tests do not add to your rescued visitor count.</p>
    <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold text-[#36583f]">Cloudflare Worker 301 interception</summary><p className="mt-2 text-xs text-[#68736b]">This checks the origin response first and intercepts only 404s. Deploy it on your domain&apos;s Worker route.</p><pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-[#172c24] p-4 text-xs text-white"><code>{worker}</code></pre><button type="button" onClick={() => void copy(worker)} className="mt-2 rounded-lg border px-3 py-2 text-sm">Copy Worker</button></details>
  </section>;
}
