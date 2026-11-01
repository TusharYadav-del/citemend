"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Globe2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";

type Preview = { domain: string; homepageStatus: number | null; sitemapStatus: number | null; previewOnly: true };

function statusText(status: number | null) {
  if (status === null) return "Could not verify";
  if (status >= 200 && status < 400) return `Reachable · HTTP ${status}`;
  return `Needs review · HTTP ${status}`;
}

export default function LandingPreview() {
  const [domain, setDomain] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPreview(null);
    let normalized: string;
    try { normalized = normalizeDashboardDomain(domain); }
    catch { setError("Enter a public domain such as example.com."); return; }
    setPending(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: normalized }),
        signal: controller.signal,
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("previewOnly" in data) || data.previewOnly !== true || !("domain" in data) || typeof data.domain !== "string") {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Preview unavailable. Try again shortly.";
        throw new Error(message);
      }
      const verified = data as Preview;
      setPreview(verified);
      window.dispatchEvent(new CustomEvent("citemend:preview-domain", { detail: verified.domain }));
    } catch (cause) {
      setError(controller.signal.aborted ? "The site check took too long. Try again in a moment." : cause instanceof Error ? cause.message : "Preview unavailable. Try again shortly.");
    } finally { clearTimeout(timeout); setPending(false); }
  }

  return <div className="rounded-[1.75rem] border border-white/15 bg-white/[.08] p-4 shadow-[0_28px_80px_-40px_#03160e] backdrop-blur sm:p-6">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#c7efaa]"><span className="size-2 rounded-full bg-[#b8ee79] shadow-[0_0_14px_#b8ee79]" /> Free site preview</div>
    <p className="mt-3 text-sm leading-6 text-[#c2d1c5]">Check your homepage and default sitemap now. Sign in for the full AI citation audit.</p>
    <form onSubmit={submit} className="mt-5" aria-busy={pending}>
      <label htmlFor="preview-domain" className="mb-2 block text-xs font-medium text-white">Domain for free preview</label>
      <div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Globe2 className="pointer-events-none absolute left-4 top-3.5 size-4 text-[#6b7c6f]" /><input id="preview-domain" name="previewDomain" type="text" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="yourbrand.com" maxLength={300} required disabled={pending} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-12 w-full rounded-xl border border-white/70 bg-white pl-11 pr-3 text-sm text-[#183529] outline-none placeholder:text-[#8c9a90] focus-visible:ring-2 focus-visible:ring-[#bcf58a] disabled:opacity-70" /></div><button type="submit" disabled={pending} className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#c6f28f] px-5 text-sm font-bold text-[#173624] transition hover:bg-[#dcffaf] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-70">{pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{pending ? "Checking..." : "Preview my site"}</button></div>
    </form>
    {error && <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-[#ffd8c9]"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{error}</p>}
    {preview && <div role="status" className="mt-5 rounded-xl border border-white/15 bg-[#102e24]/80 p-4 text-sm text-white"><p className="font-semibold">Quick check for {preview.domain}</p><div className="mt-3 grid gap-2 text-xs text-[#d1dfd2] sm:grid-cols-2"><p><span className="mr-1 text-[#c6f28f]">●</span>Homepage: {statusText(preview.homepageStatus)}</p><p><span className="mr-1 text-[#c6f28f]">●</span>Default sitemap: {statusText(preview.sitemapStatus)}</p></div><p className="mt-3 text-xs leading-5 text-[#aebfaf]">This preview checks site availability only; it does not measure AI citations or find broken cited links.</p><a href="#audit" className="mt-4 inline-flex items-center gap-2 font-semibold text-[#c6f28f] hover:underline">Continue to the full AI audit <ArrowRight className="size-3.5" /></a></div>}
    <p className="mt-4 flex items-center gap-2 text-[11px] text-[#aebfaf]"><ShieldCheck className="size-3.5" /> Read-only checks. No account needed for this preview.</p>
  </div>;
}
