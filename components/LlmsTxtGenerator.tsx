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

  return <section aria-labelledby="llms-heading" className="mb-8 rounded-2xl border border-[#dfe5dc] bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-semibold tracking-[.18em] text-[#53704e]">AI CRAWLER GUIDANCE</p><h2 id="llms-heading" className="mt-2 text-xl font-semibold">Generate llms.txt</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#68736b]">Create llms.txt and llms-full.txt from your saved sitemap and confirmed broken-link evidence.</p></div><label className="text-xs font-medium">Domain<select value={domain} onChange={(event) => { setDomain(event.target.value); setFiles(null); }} disabled={!domains.length || pending} className="mt-2 block min-h-10 min-w-48 rounded-lg border border-[#dce2d7] bg-white px-3 text-sm">{domains.length ? domains.map(item => <option key={item} value={item}>{item}</option>) : <option value="">No audited domains</option>}</select></label></div>
    <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={generate} disabled={!domain || pending} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#214d39] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{pending ? "Generating..." : files ? "Regenerate" : "Generate files"}</button>{files && <button type="button" onClick={download} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#cbd8c5] px-4 py-2 text-sm font-medium"><Download className="size-4" />Download {selected === "llmsTxt" ? "llms.txt" : "llms-full.txt"}</button>}</div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {files && <div className="mt-5"><div role="tablist" aria-label="Generated file"><button type="button" role="tab" aria-selected={selected === "llmsTxt"} onClick={() => setSelected("llmsTxt")} className={`rounded-t-lg border px-4 py-2 text-xs ${selected === "llmsTxt" ? "border-[#cbd8c5] bg-[#f7f8f4] font-semibold" : "border-transparent"}`}>llms.txt</button><button type="button" role="tab" aria-selected={selected === "llmsFullTxt"} onClick={() => setSelected("llmsFullTxt")} className={`rounded-t-lg border px-4 py-2 text-xs ${selected === "llmsFullTxt" ? "border-[#cbd8c5] bg-[#f7f8f4] font-semibold" : "border-transparent"}`}>llms-full.txt</button></div><pre className="max-h-[28rem] overflow-auto rounded-b-xl rounded-tr-xl border border-[#cbd8c5] bg-[#f7f8f4] p-4 text-xs leading-6 whitespace-pre-wrap break-words">{files[selected]}</pre><p className="mt-3 text-xs leading-5 text-[#68736b]">Download the preferred file and place it in your site&apos;s <code className="rounded bg-[#f1f4ed] px-1">/public/llms.txt</code> (or <code className="rounded bg-[#f1f4ed] px-1">/public/llms-full.txt</code>) directory, then deploy. Review descriptions and deprecated paths before publishing.</p></div>}
  </section>;
}
