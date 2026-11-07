import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { createServerDatabase } from "@/lib/supabase-server";
import { buildPublicVerifiedBenchmarks } from "@/lib/benchmark-aggregator";

export const metadata: Metadata = {
  title: "Verified AI Citation Benchmarks | CiteMend",
  description: "Privacy-safe aggregate statistics from opted-in, completed CiteMend observations, with confidence intervals and sample sizes.",
};

const causeLabels: Record<string, string> = {
  broken_destination: "Observed broken destination",
  retrieval: "No cited URL observed in the answer sample",
  citation_selection: "Customer domain absent from observed citations",
};

function Interval({ low, high, n, warning }: { low: number; high: number; n: number; warning: string | null }) {
  return <div className="mt-2 text-xs text-slate-400"><span>95% Wilson interval: {low.toFixed(1)}%–{high.toFixed(1)}% · n = {n} completed observations</span>{warning && <span className="mt-1 block font-medium text-amber-200">{warning}</span>}</div>;
}

function BenchmarkLoading() {
  return <div aria-label="Loading opt-in benchmark aggregates" role="status" className="grid gap-5 lg:grid-cols-2"><div className="h-64 animate-pulse rounded-xl border border-white/10 bg-white/[.03]" /><div className="h-64 animate-pulse rounded-xl border border-white/10 bg-white/[.03]" /><span className="sr-only">Loading privacy-safe aggregate statistics.</span></div>;
}

async function BenchmarkResults() {
  await connection();
  let result = buildPublicVerifiedBenchmarks([]);
  let databasePending = false;
  try {
    const response = await createServerDatabase().rpc("citemend_opt_in_benchmark_observations");
    if (response.error || !response.data) databasePending = true;
    else result = buildPublicVerifiedBenchmarks(response.data.map((row) => ({
      workspaceKey: row.workspace_key,
      workspaceDomain: row.workspace_domain,
      allowBenchmarkAggregation: true,
      modelName: row.model_name,
      jobStatus: row.job_status,
      extractedUrls: row.extracted_urls_json,
      urlStatus: row.url_status_json,
    })));
  } catch { databasePending = true; }

  if (databasePending) return <section role="status" className="rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-5 text-sm text-amber-100">Benchmark data is temporarily unavailable. No workspace-level evidence is shown on this page.</section>;
  if (!result.available) return <section role="status" className="rounded-xl border border-white/10 bg-[#0D1119] p-6 text-sm leading-6 text-slate-300">{result.note}</section>;

  return <>
    <p className="mb-5 rounded-xl border border-cyan-300/15 bg-cyan-300/[.04] p-4 text-xs leading-5 text-slate-300">{result.note} Domain names, buyer prompts, answer text, user identifiers, and raw citation URLs are never published here. These observational associations do not establish private model reasoning or causation.</p>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="border-white/10 bg-[#0D1119] text-[#F5F7FA]"><CardHeader><CardTitle className="text-base">Observed 404 / 410 citation rates by model</CardTitle></CardHeader><CardContent className="space-y-3">{result.model404Rates.length ? result.model404Rates.map((item) => <article key={item.model} className="rounded-lg border border-white/[.07] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{item.model}</h2><Badge variant="outline" className="border-rose-300/20 text-rose-100">{item.rate.toFixed(1)}%</Badge></div><p className="mt-1 text-xs text-slate-400">Share of checked customer-domain URL observations with a recorded 404 or 410 response.</p><Interval low={item.confidenceInterval.confidence_interval_low} high={item.confidenceInterval.confidence_interval_high} n={item.confidenceInterval.sample_size} warning={item.confidenceInterval.sample_size_warning} /></article>) : <p className="text-sm text-slate-400">No model segment currently meets the minimum opt-in sample rule with URL status evidence.</p>}</CardContent></Card>
      <Card className="border-white/10 bg-[#0D1119] text-[#F5F7FA]"><CardHeader><CardTitle className="text-base">Observable source and destination patterns</CardTitle></CardHeader><CardContent className="space-y-3">{result.forensicCauses.length ? result.forensicCauses.map((item) => <article key={item.cause} className="rounded-lg border border-white/[.07] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{causeLabels[item.cause] ?? item.cause}</h2><Badge variant="outline" className="border-cyan-300/20 text-cyan-100">{item.rate.toFixed(1)}%</Badge></div><p className="mt-1 text-xs text-slate-400">Evidence pattern only; this grouping does not establish retrieval behavior or why a model selected a source.</p><Interval low={item.confidenceInterval.confidence_interval_low} high={item.confidenceInterval.confidence_interval_high} n={item.confidenceInterval.sample_size} warning={item.confidenceInterval.sample_size_warning} /></article>) : <p className="text-sm text-slate-400">No source pattern currently meets the minimum opt-in sample rule.</p>}</CardContent></Card>
    </div>
  </>;
}

export default function BenchmarksPage() {
  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-xs text-muted-foreground"><Link href="/" className="hover:text-foreground">CiteMend</Link><span aria-hidden="true">/</span><span className="text-foreground">Benchmarks</span></nav>
      <PageHeader eyebrow="Original and privacy-safe" title="Verified AI citation benchmarks" description="Aggregated rates and observable source patterns based on completed evidence only. Every published segment must include at least five distinct workspaces that explicitly opted in." actions={<Link href="/dashboard#workspaces" className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5">Review benchmark opt-in</Link>} />
      <Suspense fallback={<BenchmarkLoading />}><BenchmarkResults /></Suspense>
      <section className="mt-8" aria-labelledby="walkthrough-title"><div className="max-w-3xl"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-emerald-300">Transparent product examples</p><h2 id="walkthrough-title" className="mt-2 text-2xl font-semibold text-white">Redacted recovery walkthroughs</h2><p className="mt-2 text-sm leading-6 text-slate-400">These are illustrative reconstructions of CiteMend workflows, not customer case studies or measured performance claims. No customer metrics or outcomes are implied.</p></div><div className="mt-5 grid gap-4 lg:grid-cols-3">{[
        { title: "Broken destination during a site migration", observed: "A recorded citation URL returned HTTP 404 on a DNS-pinned check.", verified: "The proposed same-domain destination returned HTTP 200 and passed redirect safety preview.", changed: "A workspace admin approved and deployed a host-side redirect; the action trail records the deployment.", outcome: "Technical recovery can be confirmed from HTTP checks. A later answer change must be observed separately." },
        { title: "Publisher links to a removed external reference", observed: "A publisher page contains a link to an external resource that now returns HTTP 410.", verified: "A potentially relevant page on the customer's site is found and checked, but similarity is only a ranking signal.", changed: "The team drafts a personalized publisher request to review and update the dead link.", outcome: "No publisher link update is assumed; outreach response and any later AI citation require separate observation." },
        { title: "No suitable replacement exists", observed: "An expired URL describes a topic not covered by the customer's live pages.", verified: "Available same-domain candidates do not meet the configured relevance threshold.", changed: "CiteMend returns ‘No Suitable Replacement Exists (Manual Content Creation Recommended)’.", outcome: "No redirect is proposed. This diagnostic result is preferable to routing visitors to an unrelated page." },
      ].map(item => <article key={item.title} className="rounded-xl border border-white/10 bg-[#0D1119] p-5"><h3 className="text-sm font-semibold text-white">{item.title}</h3><dl className="mt-4 space-y-3 text-xs leading-5"><div><dt className="font-semibold text-cyan-100">What Was Observed</dt><dd className="mt-0.5 text-slate-400">{item.observed}</dd></div><div><dt className="font-semibold text-emerald-100">What Was Verified</dt><dd className="mt-0.5 text-slate-400">{item.verified}</dd></div><div><dt className="font-semibold text-slate-200">What Changed</dt><dd className="mt-0.5 text-slate-400">{item.changed}</dd></div><div><dt className="font-semibold text-amber-100">Outcome</dt><dd className="mt-0.5 text-slate-400">{item.outcome}</dd></div></dl></article>)}</div></section>
      <section className="mt-6 rounded-xl border border-white/10 bg-white/[.025] p-5"><h2 className="text-sm font-semibold">How to read these numbers</h2><p className="mt-2 text-xs leading-5 text-slate-400">The Wilson 95% intervals express sampling uncertainty, not a guarantee about future answers. Rates use saved completed observations and only include workspaces with benchmark aggregation enabled. There is no private-reasoning access, ranking promise, or causal claim.</p></section>
    </div>
  </main>;
}
