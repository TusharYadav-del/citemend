"use client";

import { useState } from "react";
import { buildRedirectExport, type RedirectExportFormat } from "@/lib/redirect-export";

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

  async function copyRedirects() {
    const content = buildRedirectExport(domain, links, format);
    if (!content || format === "htaccess" && !content.includes("Redirect 301 ")) {
      setMessage("No verified 301 redirects are available to export.");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setMessage(`Copied ${format === "htaccess" ? ".htaccess" : format === "vercel" ? "Vercel JSON" : "Shopify CSV"} redirects to clipboard.`);
    } catch {
      setMessage("Clipboard access failed. Check browser permissions and try again.");
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-[#dfe5dc] bg-[#f7f8f4] p-5">
      <label htmlFor="redirect-format" className="block text-sm font-semibold">Redirect format</label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          id="redirect-format"
          value={format}
          onChange={(event) => { setFormat(event.target.value as RedirectExportFormat); setMessage(""); }}
          className="min-h-11 rounded-lg border border-[#dfe5dc] bg-white px-3 text-sm"
        >
          {formats.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button
          type="button"
          onClick={copyRedirects}
          className="min-h-11 rounded-lg bg-[#214d39] px-5 py-3 text-sm font-semibold text-white hover:bg-[#153c2a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#53704e]"
        >
          Copy All 301 Redirects
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-xs text-[#53704e]">{message}</p>
      <p className="text-xs leading-5 text-[#68736b]">Exports include only saved HTTP 404 links with verified replacement URLs on this domain. Review all rules before publishing.</p>
    </div>
  );
}


