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
      <section className="mt-6 rounded-xl border border-white/10 bg-white/[.025] p-5"><h2 className="text-sm font-semibold">How to read these numbers</h2><p className="mt-2 text-xs leading-5 text-slate-400">The Wilson 95% intervals express sampling uncertainty, not a guarantee about future answers. Rates use saved completed observations and only include workspaces with benchmark aggregation enabled. There is no private-reasoning access, ranking promise, or causal claim.</p></section>
    </div>
  </main>;
}
