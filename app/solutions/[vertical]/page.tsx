import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getVerticalSolutionPageModel, verticalSolutions } from "@/lib/vertical-solutions";

export function generateStaticParams() {
  return Object.keys(verticalSolutions).map((vertical) => ({ vertical }));
}

export async function generateMetadata({ params }: { params: Promise<{ vertical: string }> }): Promise<Metadata> {
  const { vertical } = await params;
  const solution = getVerticalSolutionPageModel(vertical)?.solution;
  return solution ? { title: `${solution.label} AI Citation Recovery | CiteMend`, description: solution.description } : { title: "Solution not found | CiteMend" };
}

export default async function VerticalSolutionPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const model = getVerticalSolutionPageModel(vertical);
  const solution = model?.solution;
  if (!solution) notFound();

  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-xs text-muted-foreground"><Link href="/" className="hover:text-foreground">CiteMend</Link><span aria-hidden="true">/</span><span>Solutions</span><span aria-hidden="true">/</span><span className="text-foreground">{solution.label}</span></nav>
      <PageHeader eyebrow={solution.eyebrow} title={solution.title} description={solution.description} actions={<Button render={<Link href={model.ctaHref} />}>{solution.cta}</Button>} />
      <section aria-label={`${solution.label} capabilities`} className="grid gap-4 sm:grid-cols-2">
        {solution.highlights.map((highlight, index) => <Card key={highlight.title} className="border-white/10 bg-[#0D1119] text-[#F5F7FA]">
          <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base font-semibold">{highlight.title}</CardTitle><Badge variant="outline" className="border-emerald-300/20 text-emerald-200">0{index + 1}</Badge></div></CardHeader>
          <CardContent><p className="text-sm leading-6 text-slate-400">{highlight.description}</p></CardContent>
        </Card>)}
      </section>
      <section className="mt-8 rounded-2xl border border-emerald-300/15 bg-emerald-300/[.04] p-5 sm:p-7"><p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-200">Evidence first</p><h2 className="mt-2 text-xl font-semibold">Review the recorded evidence before acting.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">CiteMend reports public checks and saved observations. Modeled answer profiles do not represent direct access to private reasoning, and redirects stay behind human approval.</p><div className="mt-5 flex flex-wrap gap-3"><Link href={model.ctaHref} className={buttonVariants({ size: "lg" })}>{solution.cta}</Link><Link href={model.relatedLinks[0]} className={buttonVariants({ variant: "outline", size: "lg" })}>Browse integrations</Link><Link href={model.relatedLinks[1]} className={buttonVariants({ variant: "outline", size: "lg" })}>View opt-in benchmarks</Link></div></section>
    </div>
  </main>;
}
