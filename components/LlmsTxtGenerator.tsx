"use client";

import { useState } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";

type GeneratedFiles = { llmsTxt: string; llmsFullTxt: string };

export default function LlmsTxtGenerator({ domains }: { domains: string[] }) {
  const [domain, setDomain] = useState(domains[0] ?? "");
  const [files, setFiles] = useState<GeneratedFiles | null>(null);
  const [selected, setSelected] = useState<"llmsTxt" | "llmsFullTxt">("llmsTxt");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setPending(true); setError(""); setFiles(null);
    try {
      const response = await fetch("/api/llms-txt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) });
      const data = await response.json();
      if (!response.ok || typeof data.llmsTxt !== "string" || typeof data.llmsFullTxt !== "string") throw new Error(data.error || "Could not generate the files.");
      setFiles({ llmsTxt: data.llmsTxt, llmsFullTxt: data.llmsFullTxt });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate the files. Please try again."); }
    finally { setPending(false); }
  }

  function download() {
    if (!files) return;
    const blob = new Blob([files[selected]], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = selected === "llmsTxt" ? "llms.txt" : "llms-full.txt"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section aria-labelledby="llms-heading" className="mb-8 rounded-2xl border border-border bg-surface-raised p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-semibold tracking-[.18em] text-emerald-400">AI CRAWLER GUIDANCE</p><h2 id="llms-heading" className="mt-2 text-xl font-semibold text-foreground">Generate llms.txt &amp; Facts</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">Create llms.txt and llms-full.txt from your saved sitemap and confirmed broken-link evidence.</p></div><label className="text-xs font-medium text-text-secondary">Domain<select value={domain} onChange={(event) => { setDomain(event.target.value); setFiles(null); }} disabled={!domains.length || pending} className="mt-2 block min-h-10 min-w-48 rounded-lg border border-border bg-[#0b1015] px-3 text-sm text-foreground">{domains.length ? domains.map(item => <option key={item} value={item}>{item}</option>) : <option value="">No audited domains</option>}</select></label></div>
    <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={generate} disabled={!domain || pending} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-background disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{pending ? "Generating..." : files ? "Regenerate" : "Generate files"}</button>{files && <button type="button" onClick={download} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-accent"><Download className="size-4" />Download {selected === "llmsTxt" ? "llms.txt" : "llms-full.txt"}</button>}</div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">{error}</p>}
    {files && <div className="mt-5"><div role="tablist" aria-label="Generated file"><button type="button" role="tab" aria-selected={selected === "llmsTxt"} onClick={() => setSelected("llmsTxt")} className={`rounded-t-lg border px-4 py-2 text-xs ${selected === "llmsTxt" ? "border-border bg-surface-soft font-semibold text-accent" : "border-transparent text-text-secondary"}`}>llms.txt</button><button type="button" role="tab" aria-selected={selected === "llmsFullTxt"} onClick={() => setSelected("llmsFullTxt")} className={`rounded-t-lg border px-4 py-2 text-xs ${selected === "llmsFullTxt" ? "border-border bg-surface-soft font-semibold text-accent" : "border-transparent text-text-secondary"}`}>llms-full.txt</button></div><pre className="max-h-[28rem] overflow-auto rounded-b-xl rounded-tr-xl border border-border bg-surface-raised p-4 text-xs leading-6 whitespace-pre-wrap break-words text-foreground">{files[selected]}</pre><p className="mt-3 text-xs leading-5 text-text-secondary">Download the preferred file and place it in your site&apos;s <code className="rounded bg-surface-soft px-1">/public/llms.txt</code> (or <code className="rounded bg-surface-soft px-1">/public/llms-full.txt</code>) directory, then deploy. Review descriptions and deprecated paths before publishing.</p></div>}
  </section>;
}
