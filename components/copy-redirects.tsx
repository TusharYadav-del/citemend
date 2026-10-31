"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { RedirectExportFormat } from "@/lib/redirect-export";
import UpgradeModal from "@/components/upgrade-modal";

const formats: { value: RedirectExportFormat; label: string }[] = [
  { value: "htaccess", label: ".htaccess" },
  { value: "vercel", label: "Vercel JSON" },
  { value: "shopify", label: "Shopify CSV" },
];

export default function CopyRedirects({
  domain,
  links,
}: {
  domain: string;
  links: { cited_url: string; http_status: number; suggested_redirect: string | null }[];
}) {
  const [format, setFormat] = useState<RedirectExportFormat>("htaccess");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [upgrade, setUpgrade] = useState<"signed-in" | "signed-out" | null>(null);

  async function copyRedirects() {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/redirect-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, links, format }),
      });
      const data: { content?: string; error?: string; code?: string } = await response.json();
      if (response.status === 401 || response.status === 403) {
        setUpgrade(response.status === 401 ? "signed-out" : "signed-in");
        toast.info("Upgrade to Pro to copy 301 redirects.");
        return;
      }
      if (!response.ok || typeof data.content !== "string") throw new Error(data.error || "Redirect export is temporarily unavailable.");
      try { await navigator.clipboard.writeText(data.content); }
      catch { throw new Error("Clipboard access is unavailable. Please allow clipboard access and try again."); }
      setMessage("Redirects copied to clipboard.");
      toast.success("301 redirects copied to clipboard.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not copy redirects. Please try again.";
      setMessage(message);
      toast.error(message);
    } finally { setPending(false); }
  }

  return (
    <div className="mt-6 rounded-xl border border-[#dfe5dc] bg-[#f7f8f4] p-5">
      <label htmlFor="redirect-format" className="block text-sm font-semibold">Redirect format</label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select id="redirect-format" value={format} onChange={(event) => { setFormat(event.target.value as RedirectExportFormat); setMessage(""); }} className="min-h-11 rounded-lg border border-[#dfe5dc] bg-white px-3 text-sm">
          {formats.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button type="button" onClick={copyRedirects} disabled={pending} className="min-h-11 rounded-lg bg-[#214d39] px-5 py-3 text-sm font-semibold text-white hover:bg-[#153c2a] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#53704e]">
          {pending ? "Checking access..." : "Copy All 301 Redirects"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-xs text-[#53704e]">{message}</p>
      <p className="text-xs leading-5 text-[#68736b]">One-click export is included with Pro. Exports include only saved HTTP 404 links with verified replacement URLs on this domain.</p>
      {upgrade && <UpgradeModal signedIn={upgrade === "signed-in"} onClose={() => setUpgrade(null)} />}
    </div>
  );
}
