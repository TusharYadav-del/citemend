"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleCheck, Copy, FileText, Globe2, Link2, Loader2, Search, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { citationHealth, normalizeDashboardDomain, parseDashboardReport, redirectRule, type DashboardReport } from "@/lib/audit-dashboard";

const subscribeToHydration = () => () => {};

function ClerkAuditAccess({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div role="status" className="py-8 text-center text-sm text-[#68736b]">Checking your sign-in…</div>;
  if (!isSignedIn) return <div className="rounded-xl border border-[#dce6d1] bg-[#f7f9f3] p-5 text-center"><h3 className="text-sm font-semibold">Sign in to run your audit</h3><p className="mt-2 text-xs leading-5 text-[#68736b]">Create a free account or sign in with your email or Google to use the live audit workspace.</p><SignInButton mode="modal"><button type="button" className="mt-4 rounded-lg bg-[#214d39] px-5 py-3 text-sm font-medium text-white hover:bg-[#153c2a]">Sign in or create an account</button></SignInButton></div>;
  return children;
}

function ClerkAccountControl() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  return isSignedIn ? <UserButton /> : <SignInButton mode="modal"><button type="button" className="rounded-full bg-[#214d39] px-4 py-2 text-white">Sign in</button></SignInButton>;
}

export default function AuditDashboard({ liveEnabled, clerkConfigured }: { liveEnabled: boolean; clerkConfigured: boolean }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [domain, setDomain] = useState("");
  const [prompt, setPrompt] = useState("What are the best solutions for my business, and where can I find their pricing and documentation?");
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !hydrated) return;
    setError(null); setReport(null); setCopied(null); setCopyError(null);
    let cleanDomain: string;
    try { cleanDomain = normalizeDashboardDomain(domain); }
    catch { setError("Enter a domain such as stripe.com. Leave out page paths, ports, and query strings."); return; }
    if (!prompt.trim()) { setError("Add a sample buyer prompt to tell the AI what to research."); return; }
    setPending(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: cleanDomain, buyerPrompt: prompt.trim() }), signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 429 ? "The AI provider is rate limiting requests. Wait a moment before trying again." : typeof data?.error === "string" ? data.error : "The audit could not finish. Please try again.");
      setReport(parseDashboardReport(data));
    } catch (cause) {
      setError(controller.signal.aborted ? "The request took too long. It may still be running; wait a moment before starting another audit." : cause instanceof TypeError ? "Connection lost. Please check your connection and try again." : cause instanceof Error ? cause.message : "Connection lost. Please check your connection and try again.");
    } finally { clearTimeout(timeout); setPending(false); }
  }
  async function copyRule(url: string, destination: string) {
    setCopyError(null);
    try { await navigator.clipboard.writeText(redirectRule(url, destination)); setCopied(url); }
    catch { setCopyError("Clipboard access is unavailable. Select and copy the rule shown below the redirect URL."); }
  }
  const health = report ? citationHealth(report.findings) : null;
  const broken = report?.findings.filter((finding) => finding.httpStatus === 404) ?? [];
  const ready = broken.filter((finding) => finding.suggestedRedirect).length;

  return <div className="audit-workspace min-h-screen bg-[#f7f8f4] text-[#182c25]">
    <a href="#audit" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4">Skip to audit form</a>
    <header className="border-b border-[#dfe5dc] bg-[#fcfdf9]/95">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="#" aria-label="Citemend home" className="flex items-center gap-2.5 text-xl font-bold tracking-tight"><span className="grid size-9 place-items-center rounded-xl bg-[#173f32] text-[#d9f49a]"><Link2 className="size-5 -rotate-45" /></span>citemend<span className="mb-3 size-1.5 rounded-full bg-[#7ba751]" /></a>
        <nav aria-label="Main navigation" className="flex items-center gap-4 text-sm font-medium"><a href="#how-it-works" className="hidden text-[#657168] hover:text-[#173f32] sm:block">How it works</a><a href="#audit" className="flex items-center gap-2 rounded-full border border-[#d2dacc] bg-white px-4 py-2">Open workspace <ArrowUpRight className="size-3.5" /></a>{clerkConfigured && <ClerkAccountControl />}</nav>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <section className="relative pt-14 pb-10 sm:pt-20 sm:pb-14">
        <div className="mb-6 flex items-center gap-2 text-[11px] font-semibold tracking-[.18em] text-[#53704e]"><span className="size-1.5 rounded-full bg-[#719758]" /> AI CITATION INTELLIGENCE <span className="mx-2 h-px w-8 bg-[#b9c8ae]" /></div>
        <h1 className="max-w-4xl text-[clamp(2.35rem,5.3vw,4.2rem)] leading-[1.06] font-semibold tracking-[-.055em]">Catch Dead AI Links Before They Kill Your <span className="text-[#658848]">Organic Traffic.</span></h1>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-5"><p className="max-w-xl text-base leading-7 text-[#68736b]">AI is recommending your business. Make sure it sends people somewhere that works. Find broken citations and turn dead ends into the right next step.</p><a href="#audit" className="flex items-center gap-2 pb-1 text-sm font-medium">Find your dead ends <ArrowDown className="size-4" /></a></div>
      </section>

      <section id="audit" aria-labelledby="audit-heading" className="grid scroll-mt-8 gap-5 lg:grid-cols-[1.45fr_1fr]">
        <Card className="gap-0 rounded-2xl bg-white py-0 shadow-[0_8px_30px_-20px_#1d3c2a30] ring-[#dfe5dc]">
          <CardHeader className="border-b border-[#edf0e9] px-6 py-5 sm:px-7"><div className="flex items-center justify-between gap-4"><h2 id="audit-heading" className="text-lg font-semibold tracking-tight">Start with your domain</h2><Badge variant="outline" className="h-6 border-[#dae2d4] bg-[#f5f8f0] text-[10px] text-[#557447]">LIVE AUDIT</Badge></div><p className="mt-1 text-sm text-[#7a837b]">See your site through an AI buyer&apos;s eyes.</p></CardHeader>
          <CardContent className="px-6 py-6 sm:px-7">{clerkConfigured ? <ClerkAuditAccess><form onSubmit={submit} className="space-y-5" aria-busy={pending}>
            <div><label htmlFor="audit-domain" className="mb-2 block text-xs font-semibold">Your website domain</label><div className="relative"><Globe2 className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-[#8a9587]" /><Input id="audit-domain" name="domain" placeholder="stripe.com" value={domain} onChange={(event) => setDomain(event.target.value)} required maxLength={300} disabled={pending || !hydrated} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-11 rounded-lg border-[#dce2d7] bg-[#fcfdfb] pl-10 shadow-none" /></div></div>
            <div><label htmlFor="buyer-prompt" className="mb-2 block text-xs font-semibold">Sample buyer prompt</label><textarea id="buyer-prompt" name="buyerPrompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} required maxLength={4000} disabled={pending || !hydrated} className="min-h-24 w-full resize-y rounded-lg border border-[#dce2d7] bg-[#fcfdfb] px-3.5 py-3 text-sm leading-6 outline-none focus-visible:border-[#648346] focus-visible:ring-2 focus-visible:ring-[#dceacb] disabled:opacity-60" /><p className="mt-1.5 text-[11px] text-[#899084]">Try a question your next customer might ask an AI assistant.</p></div>
            <Button type="submit" disabled={pending || !liveEnabled || !hydrated} className="h-12 w-full gap-2.5 rounded-lg bg-[#214d39] text-sm font-medium text-white hover:bg-[#153c2a]">{pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{pending ? "Running your audit..." : "Run AI Audit"}{!pending && <ArrowRight className="ml-auto size-4" />}</Button>
            <p className="flex items-center justify-center gap-1.5 text-[10px] text-[#828d7e]"><ShieldCheck className="size-3" />{liveEnabled ? "Read-only website checks. No changes are made to your site." : "Live audits are available in the local workspace."}</p>
          </form></ClerkAuditAccess> : <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><h3 className="font-semibold">Clerk setup is required to run audits</h3><p className="mt-2 text-xs leading-5">Create a Clerk application, enable Google and Email sign-in, then add its publishable and secret keys to your ignored .env.local file and restart the dev server.</p></div>}</CardContent>
        </Card>
        <aside id="how-it-works" className="relative overflow-hidden rounded-2xl bg-[#183c2f] px-7 py-7 text-[#e8f1e1] sm:px-8">
          <div className="pointer-events-none absolute -top-12 -right-12 size-48 rounded-full border border-[#365542]" /><div className="pointer-events-none absolute -top-5 -right-5 size-32 rounded-full border border-[#365542]" />
          <p className="relative text-[10px] font-medium tracking-[.2em] text-[#b8cf9e]">FROM MENTION TO DESTINATION</p><h2 className="relative mt-3 max-w-56 text-2xl leading-tight font-medium tracking-tight">Close the gap between AI visibility and real visits.</h2>
          <ol className="relative mt-8 space-y-6">{[{ icon: Search, title: "Discover the citations", detail: "Research how AI answers your buyer prompt." }, { icon: Link2, title: "Check the destination", detail: "Verify the HTTP status of your cited URLs." }, { icon: ArrowUpRight, title: "Find the way forward", detail: "Match 404s to verified live sitemap pages." }].map((step, index) => <li key={step.title} className="flex gap-4"><span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#49624b] bg-[#244635] text-[#cde5aa]"><step.icon className="size-3.5" /></span><div><p className="text-xs font-medium"><span className="mr-2 text-[#82977c]">0{index + 1}</span>{step.title}</p><p className="mt-1 text-[11px] leading-5 text-[#a5b6a1]">{step.detail}</p></div></li>)}</ol>
          <div className="mt-7 border-t border-[#365440] pt-4 text-[10px] text-[#a5b6a1]">Search-backed answers. Real HTTP checks. Actionable next steps.</div>
        </aside>
      </section>

      {pending && <div role="status" className="mt-7 flex items-center gap-4 rounded-xl border border-[#dce6d1] bg-[#f0f5e9] p-5"><Loader2 className="size-5 shrink-0 animate-spin text-[#557447]" /><div><p className="text-sm font-medium">Following your AI citations</p><p className="mt-1 text-xs text-[#6c7965]">Researching sources, checking URLs, and finding redirect candidates. This can take a minute.</p></div></div>}
      {error && <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">We couldn&apos;t finish this audit</p><p className="mt-1 leading-6">{error}</p></div></div>}

      <section id="results" aria-labelledby="results-heading" className="scroll-mt-8 pt-11" aria-live="polite">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h2 id="results-heading" className="text-lg font-semibold tracking-tight">Your citation report</h2>{report && <Badge variant="outline" className="border-[#ccd9c2] text-[#587048]">{report.status === "partial" ? "Partial audit" : "Audit complete"}</Badge>}</div><p className="text-xs text-[#86907e]">{report ? report.domain : "A clearer picture starts with one audit."}</p></div>
        {!report && !pending && <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#d6dfce] px-6 py-12 text-center"><span className="mb-4 grid size-12 place-items-center rounded-full bg-[#edf1e7]"><FileText className="size-5 text-[#7b946a]" /></span><h3 className="text-sm font-medium">Your next opportunity is one audit away.</h3><p className="mt-2 max-w-sm text-xs leading-6 text-[#85907e]">Run an audit to see your citation health, confirmed broken links, and suggested redirects. No sample numbers. Just your results.</p></div>}
        {report && health && <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="gap-0 bg-white py-5 ring-[#dfe5dc]"><CardContent className="flex items-center justify-between gap-3 px-5"><div><h3 className="text-[11px] font-medium text-[#71806a]">AI Citation Health Score</h3><p data-testid="health-score" className="mt-3 text-3xl font-semibold tracking-tight">{health.score ?? "—"}<span className="ml-1 text-sm font-normal text-[#99a38f]">{health.score !== null ? "/ 100" : ""}</span></p><p className="mt-2 text-[10px] text-[#8a9483]">{health.verified ? `${health.healthy} healthy of ${health.verified} verified` : "No verified target citations"}</p></div><svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="#edf1e6" strokeWidth="5" /><circle cx="32" cy="32" r="27" fill="none" stroke={health.score !== null && health.score < 50 ? "#c87558" : "#86a75e"} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(health.score ?? 0) * 1.697} 170`} /></svg></CardContent></Card>
            <Card className="gap-0 bg-white py-5 ring-[#dfe5dc]"><CardContent className="px-5"><h3 className="flex items-center justify-between text-[11px] font-medium text-[#71806a]">Confirmed broken links<TriangleAlert className="size-4 text-[#bc7a5d]" /></h3><p className="mt-3 text-3xl font-semibold tracking-tight">{broken.length.toString().padStart(2, "0")}</p><p className="mt-2 text-[10px] text-[#8a9483]">Cited URLs returning HTTP 404</p></CardContent></Card>
            <Card className="gap-0 bg-white py-5 ring-[#dfe5dc]"><CardContent className="px-5"><h3 className="flex items-center justify-between text-[11px] font-medium text-[#71806a]">Redirects ready to review<ArrowUpRight className="size-4 text-[#73954f]" /></h3><p className="mt-3 text-3xl font-semibold tracking-tight">{ready.toString().padStart(2, "0")}</p><p className="mt-2 text-[10px] text-[#8a9483]">Suggested destinations verified as live</p></CardContent></Card>
          </div>
          {(report.warnings.length > 0 || health.unknown > 0) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900"><p className="font-semibold">Some checks need a closer look</p>{health.unknown > 0 && <p>{health.unknown} URL check(s) are unresolved and excluded from the health score.</p>}<ul>{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          <Card className="gap-0 overflow-hidden bg-white py-0 ring-[#dfe5dc]"><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-[#e9ede4] px-5 py-5"><h3 className="text-sm font-semibold">Broken citations & redirect opportunities</h3><Badge variant="secondary" className="bg-[#f0f3eb] text-[10px] text-[#6f8062]">{broken.length} detected</Badge></CardHeader>
            {broken.length ? <Table className="min-w-[740px]"><TableHeader className="bg-[#fafbf7]"><TableRow><TableHead className="px-5 text-[10px] tracking-wide text-[#809074]">BROKEN AI CITATION</TableHead><TableHead className="text-[10px] tracking-wide text-[#809074]">STATUS</TableHead><TableHead className="text-[10px] tracking-wide text-[#809074]">SUGGESTED DESTINATION</TableHead><TableHead className="px-5 text-right text-[10px] tracking-wide text-[#809074]">301 RULE</TableHead></TableRow></TableHeader><TableBody>{broken.map((finding) => <TableRow key={finding.url}><TableCell className="max-w-64 px-5 py-5 whitespace-normal"><span className="break-all text-xs font-medium">{finding.url}</span></TableCell><TableCell><Badge variant="destructive" className="rounded-md text-[10px]">404</Badge></TableCell><TableCell className="max-w-72 py-5 whitespace-normal">{finding.suggestedRedirect ? <><p className="break-all text-xs text-[#456936]">{finding.suggestedRedirect}</p><code className="mt-2 block max-w-72 overflow-x-auto text-[9px] text-[#8b9583]">{redirectRule(finding.url, finding.suggestedRedirect)}</code></> : <p className="text-xs text-[#8a9483]">No verified replacement found</p>}</TableCell><TableCell className="px-5 text-right"><Button type="button" variant="outline" disabled={!finding.suggestedRedirect} onClick={() => finding.suggestedRedirect && copyRule(finding.url, finding.suggestedRedirect)} aria-label={`Copy 301 Rule for ${finding.url}`} className="h-8 gap-2 border-[#dbe3d2] text-[10px]">{copied === finding.url ? <Check className="size-3" /> : <Copy className="size-3" />}{copied === finding.url ? "Copied!" : "Copy 301 Rule"}</Button></TableCell></TableRow>)}</TableBody></Table> : <div className="flex flex-col items-center px-6 py-12 text-center"><CircleCheck className="mb-3 size-8 text-[#7d9d5d]" /><h4 className="text-sm font-medium">No confirmed 404s in this audit</h4><p className="mt-2 max-w-md text-xs leading-6 text-[#87927e]">{report.findings.length ? "Your checked citations returned no 404 responses. Review any unresolved checks above for the full picture." : "No citations matching your domain were found. Try a more specific buyer prompt to gather more evidence."}</p></div>}
            <div className="border-t border-[#edf0e8] bg-[#fafbf7] px-5 py-3 text-[10px] leading-5 text-[#8a9483]">Rules use Apache mod_alias path-prefix matching; query strings are not matched. Review on your host before applying. No redirects are deployed automatically.</div>
          </Card>
          <p role="status" className="sr-only">{copied ? "301 rule copied to clipboard." : ""}</p>{copyError && <p role="alert" className="text-xs text-red-700">{copyError}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#8b9584]"><p className="flex items-center gap-1.5"><ShieldCheck className="size-3" />{report.persistence?.status === "failed" ? "Report not saved to history" : report.persistence?.status === "disabled" ? "Local report - not saved" : "Saved to your audit history"} · {report.sitemapUrlCount.toLocaleString()} sitemap URLs discovered</p><p>{report.searchGrounding?.status === "available" ? "Live search evidence available" : "Review search coverage in audit warnings"}</p></div>
          <details className="rounded-xl border border-[#dfe5dc] bg-white px-5 py-4"><summary className="cursor-pointer text-xs font-medium">View AI answer & audit details</summary><p className="mt-4 text-xs leading-6 whitespace-pre-wrap text-[#687461]">{report.generatedText}</p><p className="mt-4 break-all text-[10px] text-[#8b9584]">Audit ID: {report.auditId ?? "Not saved"}</p></details>
        </div>}
      </section>
      <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe5dc] pt-6 text-[10px] text-[#929b8b]"><p>citemend <span className="mx-2">/</span> Keep every AI mention moving forward.</p><p>Discover. Verify. Recover.</p></footer>
    </main>
  </div>;
}
