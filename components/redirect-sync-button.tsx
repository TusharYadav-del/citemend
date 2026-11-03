"use client";

import { useState } from "react";

type Format = "vercel" | "nextjs" | "cloudflare" | "nginx" | "shopify";
const formats: { id: Format; label: string; filename: string }[] = [
  { id: "vercel", label: "Vercel", filename: "vercel.json" }, { id: "nextjs", label: "Next.js", filename: "next.config.mjs" },
  { id: "cloudflare", label: "Cloudflare / Netlify", filename: "_redirects" }, { id: "nginx", label: "Nginx", filename: "redirects.conf" },
  { id: "shopify", label: "Shopify", filename: "shopify-redirects.csv" },
];

export default function RedirectSyncButton({ domains, linkId, auditId, initiallySynced = false }: { domains: string[]; linkId?: string; auditId?: string; initiallySynced?: boolean }) {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState(domains[0] ?? "");
  const [format, setFormat] = useState<Format>("shopify");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");
  const [synced, setSynced] = useState(initiallySynced);
  const [busy, setBusy] = useState(false);
  async function run(action: "export" | "sync") {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/redirects/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, format, action, ...(linkId ? { linkId } : {}), ...(auditId ? { auditId } : {}) }) });
      const data = await response.json() as { error?: string; content?: string; count?: number; results?: { id: string; status: string; message?: string }[] };
      if (!response.ok) throw new Error(data.error ?? "Redirect sync failed.");
      if (action === "export") { setContent(data.content ?? ""); setStatus(`${data.count ?? 0} redirect(s) ready to copy or download.`); }
      else {
        const entries = data.results ?? [];
        const success = entries.filter(item => item.status === "synced").length;
        setSynced(entries.length > 0 && success === entries.length);
        setStatus(`${success} of ${entries.length} redirects synced. ${entries.filter(item => item.message).map(item => item.message).join(" ")}`);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : "Redirect sync failed."); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = formats.find(item => item.id === format)!.filename; anchor.click(); URL.revokeObjectURL(url);
  }
  return <><button type="button" onClick={() => setOpen(true)} disabled={!domains.length} className="rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-40">{synced ? "✅ Synced (301)" : linkId ? "Push 301" : "1-Click Sync to Shopify / Vercel"}</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"><section role="dialog" aria-modal="true" aria-label="Sync redirects" className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#101719] p-6 text-white"><div className="flex justify-between"><h2 className="text-lg font-semibold">Sync or export 301 redirects</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close sync dialog">✕</button></div>
      {domains.length > 1 && <label className="mt-4 block text-xs text-slate-300">Domain <select value={domain} onChange={event => { setDomain(event.target.value); setContent(""); }} className="ml-2 rounded bg-slate-800 p-2">{domains.map(item => <option key={item}>{item}</option>)}</select></label>}
      <div className="mt-4 flex flex-wrap gap-2">{formats.map(item => <button key={item.id} type="button" aria-pressed={format === item.id} onClick={() => { setFormat(item.id); setContent(""); setStatus(""); }} className={`rounded border px-2 py-1 text-xs ${format === item.id ? "border-emerald-300 text-emerald-300" : "border-white/20"}`}>{item.label}</button>)}</div>
      <p className="mt-3 text-xs text-slate-400">{format === "shopify" ? "Push to the connected Shopify store or download a CSV." : "Generate and deploy this file on your platform."}</p>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void run("export")} className="rounded border border-white/20 px-3 py-2 text-sm">Generate file</button>{format === "shopify" && <button type="button" disabled={busy} onClick={() => void run("sync")} className="rounded bg-emerald-400 px-3 py-2 text-sm font-semibold text-black">{busy ? "Syncing…" : "Push to Shopify"}</button>}</div>
      {content && <><pre className="mt-4 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-3 text-xs">{content}</pre><div className="mt-2 flex gap-2"><button type="button" onClick={() => void navigator.clipboard.writeText(content)} className="rounded border px-3 py-1 text-xs">Copy</button><button type="button" onClick={download} className="rounded border px-3 py-1 text-xs">Download</button></div></>}
      <p role="status" className="mt-4 text-xs text-slate-300">{status}</p></section></div>}
  </>;
}
