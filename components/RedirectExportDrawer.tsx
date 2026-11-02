"use client";

import { useState } from "react";
import { Download, Copy, X } from "lucide-react";
import { formatRedirects, redirectExportFilename, type RedirectExportPlatform, type RedirectRuleInput } from "@/lib/redirect-formatters";

const platforms: { id: RedirectExportPlatform; label: string; hint: string }[] = [
  { id: "vercel", label: "Vercel", hint: "vercel.json" },
  { id: "nextjs", label: "Next.js", hint: "next.config.ts snippet" },
  { id: "cloudflare", label: "Cloudflare / Netlify", hint: "_redirects" },
  { id: "wordpress", label: "WordPress", hint: "Redirection CSV" },
  { id: "shopify", label: "Shopify", hint: "URL Redirects CSV" },
];

export default function RedirectExportDrawer({ rules }: { rules: RedirectRuleInput[] }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<RedirectExportPlatform>("vercel");
  const [message, setMessage] = useState("");
  const content = formatRedirects(platform, rules);

  async function copyCode() {
    try { await navigator.clipboard.writeText(content); setMessage("Code copied."); }
    catch { setMessage("Clipboard access is unavailable. Allow clipboard access and try again."); }
  }

  function downloadFile() {
    const blob = new Blob([content], { type: platform.includes("csv") || platform === "wordpress" || platform === "shopify" || platform === "cloudflare" ? "text/plain;charset=utf-8" : "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = redirectExportFilename(platform);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-[#214d39] px-4 py-2 text-sm font-semibold text-white hover:bg-[#153c2a]">Export Redirects</button>
    {open && <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="redirect-export-title" className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-[#dfe5dc] px-6 py-5"><div><h2 id="redirect-export-title" className="text-lg font-semibold">Export Redirects</h2><p className="mt-1 text-xs text-[#68736b]">{rules.length} active approved redirect{rules.length === 1 ? "" : "s"} ready to download.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close export drawer" className="rounded p-2 hover:bg-[#f1f4ed]"><X className="size-4" /></button></header>
        <nav aria-label="Export platform" className="flex flex-wrap gap-2 border-b border-[#e7ebe3] px-6 py-4">{platforms.map((item) => <button key={item.id} type="button" onClick={() => { setPlatform(item.id); setMessage(""); }} aria-pressed={platform === item.id} className={`rounded-full border px-3 py-2 text-xs ${platform === item.id ? "border-[#557c43] bg-[#eaf3e3] font-semibold text-[#244b31]" : "border-[#dce2d7] hover:bg-[#f7f8f4]"}`}>{item.label}</button>)}</nav>
        <div className="flex-1 overflow-auto px-6 py-5"><p className="mb-3 text-xs text-[#68736b]">{platforms.find((item) => item.id === platform)?.hint}</p><pre className="min-h-64 overflow-auto rounded-xl bg-[#17251f] p-4 text-xs leading-6 whitespace-pre-wrap text-[#e8f1e1]"><code>{content || "No active approved redirects are available."}</code></pre>{platform === "wordpress" && <p className="mt-3 text-xs leading-5 text-[#68736b]">Import this CSV in the WordPress Redirection plugin. Apache .htaccess lines are included alongside the CSV export choices on the dashboard rule controls.</p>}<p role="status" aria-live="polite" className="mt-3 min-h-5 text-xs text-[#53704e]">{message}</p></div>
        <footer className="flex flex-wrap justify-end gap-3 border-t border-[#dfe5dc] px-6 py-4"><button type="button" onClick={copyCode} className="inline-flex items-center gap-2 rounded-lg border border-[#cbd8c5] px-4 py-2 text-sm font-medium"><Copy className="size-4" />Copy Code</button><button type="button" onClick={downloadFile} className="inline-flex items-center gap-2 rounded-lg bg-[#214d39] px-4 py-2 text-sm font-semibold text-white"><Download className="size-4" />Download File</button></footer>
      </section>
    </div>}
  </>;
}
