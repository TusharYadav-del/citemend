import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Database, FileSearch, Radar, ShieldCheck, Waypoints } from "lucide-react";
import { FreeProvenanceAuditor } from "@/components/free-provenance-auditor";
import { PipelineShowcase } from "@/components/pipeline-showcase";
import { PublicPricingPlans } from "@/components/public-pricing-plans";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SectionHeading } from "@/components/ui/section-heading";

export const metadata: Metadata = {
  title: "CiteMend | Recover broken AI citations",
  description: "Find broken AI citations and inspect cited URLs. Review stale facts and safe replacements, then verify approved fixes across Shopify and Cloudflare.",
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", title: "CiteMend | Recover broken AI citations", description: "Find broken AI citations and inspect cited URLs. Review stale facts and safe replacements, then verify approved fixes across Shopify and Cloudflare." },
  twitter: { card: "summary_large_image", title: "CiteMend | Recover broken AI citations", description: "Find broken AI citations and inspect cited URLs. Review stale facts and safe replacements, then verify approved fixes." },
};

const pillars = [
  { id: "01", title: "Recovery", icon: Radar, description: "Trace broken citation URLs, compare replacement context, then review an approval-ready redirect diff.", visual: <div className="mt-6 space-y-2 rounded-lg border border-border bg-[#0B0D10] p-3 font-mono text-xs"><div className="flex justify-between gap-3"><span className="truncate text-danger">/products/classic-pack-v2</span><span className="text-danger">404</span></div><div className="flex justify-between gap-3"><span className="truncate text-text-tertiary">→ /products/classic-pack</span><span className="text-warning">review</span></div></div> },
  { id: "02", title: "Intelligence", icon: ShieldCheck, description: "Inspect crawler access, page freshness, navigation weight, and source extractability in one evidence view.", visual: <div className="mt-6 overflow-hidden rounded-lg border border-border bg-[#0B0D10] font-mono text-[10px]"><div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border px-3 py-2 text-text-tertiary"><span>CRAWLER</span><span>ROBOTS</span></div>{["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended"].map((bot, i) => <div key={bot} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-1.5 text-text-secondary"><span>{bot}</span><span className={i === 2 ? "text-danger" : "text-success"}>{i === 2 ? "BLOCKED" : "ALLOWED"}</span></div>)}</div> },
  { id: "03", title: "AI analytics", icon: FileSearch, description: "Separate retrieved sources from rendered citations and review claim-level freshness or attribution drift.", visual: <div className="mt-6 space-y-2 rounded-lg border border-border bg-[#0B0D10] p-3 font-mono text-[10px]"><p className="text-text-tertiary">CLAIM DIFF · F1–F6 REVIEW</p><p><span className="text-danger">−</span> Winter price: $42</p><p><span className="text-success">+</span> Current price: $38</p><p className="text-warning">F5 · stale information · human review</p></div> },
];

const benchmarks = [
  ["58%", "commercial .com links decay", "Link rot baseline"],
  ["82–85%", "AI citations come from earned media", "Source mix"],
  ["3.2×", "citation lift associated with freshness", "30-day freshness"],
  ["78% → 33%", "agent extraction as navigation exceeds 60 links", "Navigation load"],
];

export default function Home() {
  return <><SiteHeader /><main className="overflow-hidden bg-background text-foreground">
    <section id="top" className="relative border-b border-border">
      <div aria-hidden="true" className="cm-grid pointer-events-none absolute inset-0 opacity-60"/><div aria-hidden="true" className="cm-hero-glow pointer-events-none absolute inset-x-0 top-0 h-[38rem]"/>
      <div className="cm-container relative grid gap-9 py-12 sm:py-16 lg:grid-cols-[.84fr_1.16fr] lg:items-center lg:gap-12 lg:py-20">
        <div className="max-w-2xl"><p className="cm-status-pill"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-40 motion-reduce:animate-none"/><span className="relative inline-flex size-2 rounded-full bg-accent"/></span>Commerce reliability & citation provenance</p>
          <h1 className="mt-6 max-w-[12ch] text-[clamp(3.1rem,7vw,5.75rem)] font-semibold leading-[.94] tracking-[-.065em]">Recover lost AI citations before broken links cost revenue.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-text-secondary sm:text-lg sm:leading-8">Find broken AI citations and inspect cited URLs: detect dead destinations and stale facts, prevent SEO-harming soft-404 redirects, then review and deploy approved fixes to Shopify or Cloudflare.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Link href="/pricing" className="cm-button-primary">Start $149 Pilot <ArrowUpRight className="size-4"/></Link><Link href="#workflow" className="cm-button-secondary">Explore the workflow <ArrowRight className="size-4"/></Link></div>
          <p className="mt-5 flex items-center gap-2 text-xs text-text-tertiary"><Check className="size-3.5 text-accent"/> Human approval before deployment <span aria-hidden="true">·</span> No guaranteed AI visibility claims</p>
        </div>
        <div className="relative min-w-0 rounded-2xl border border-border bg-surface p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_30px_100px_-56px_rgba(16,185,129,.35)]"><div className="absolute inset-x-8 top-0 h-px bg-white/[.06]"/><div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md border border-border bg-background"><Waypoints className="size-3.5 text-accent"/></span><span className="text-xs font-semibold">Free provenance auditor</span></div><span className="rounded-full border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-text-tertiary">Live · one public page</span></div><div className="rounded-xl border border-border bg-background"><FreeProvenanceAuditor compact/></div></div>
      </div>
      <div className="border-t border-border bg-surface/55"><div className="cm-container grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">{benchmarks.map(([metric, label, caption])=><div key={metric} className="bg-background/90 px-5 py-5 sm:px-6"><p className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-[1.75rem]">{metric}</p><p className="mt-2 text-xs leading-5 text-text-secondary">{label}</p><p className="mt-2 font-mono text-[9px] uppercase tracking-[.12em] text-text-tertiary">{caption}</p></div>)}</div></div>
    </section>

    <PipelineShowcase/>

    <section id="platform" className="scroll-mt-20 border-y border-border bg-surface/35"><div className="cm-container py-[var(--space-section)]"><SectionHeading eyebrow="Built around evidence" title="Three live pillars. One reviewable operating loop." description="Start with URL recovery, expand into page intelligence, and keep observed AI provenance tied to its source."/><div className="mt-9 grid gap-4 lg:grid-cols-3">{pillars.map(({id,title,icon:Icon,description,visual})=><article key={id} className="cm-panel group min-w-0 p-5 sm:p-6"><div className="flex items-center justify-between"><span className="font-mono text-xs text-text-tertiary">{id} / LIVE</span><Icon className="size-4 text-text-secondary transition-colors group-hover:text-accent"/></div><h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-text-secondary">{description}</p>{visual}</article>)}</div><div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><Database className="size-4 text-text-tertiary"/><p className="text-sm font-medium">Built to scale</p></div><p className="text-xs leading-5 text-text-secondary">04 Catalog <span className="px-2 text-text-tertiary">·</span> 05 Agent reliability <span className="px-2 text-text-tertiary">·</span> 06 Enterprise</p><span className="w-fit rounded-full border border-border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-text-tertiary">Roadmap</span></div></div></section>

    <PublicPricingPlans/>
    <section id="faq" className="cm-container scroll-mt-24 border-t border-border py-[var(--space-section)]"><div className="grid gap-9 lg:grid-cols-[.65fr_1.35fr] lg:gap-16"><SectionHeading eyebrow="Clear safeguards" title="Repair the path. Keep the evidence." description="CiteMend records observed technical states and keeps recommendations reviewable."/><div className="space-y-2">{[
      ["Can CiteMend control what AI systems say?", "No. CiteMend checks search-grounded results and their URLs. Modeled engine profiles are not direct queries to each named engine."],
      ["Will CiteMend publish a redirect automatically?", "No. A person reviews and approves every destination before a redirect can be deployed."],
      ["Does a verified redirect mean an AI citation was recovered?", "No. Deployment, destination health, a later citation observation, referral traffic, and revenue attribution are separate evidence milestones."],
      ["What does the free auditor check?", "One public HTTP(S) page: response status, archive context for confirmed 404/410, crawler access, navigation links, SSR text, and basic metadata."],
    ].map(([q,a])=><details key={q} className="group rounded-lg border border-border bg-surface px-4 py-4 sm:px-5"><summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-5 text-sm font-semibold marker:content-none focus-visible:outline-2 focus-visible:outline-accent"><span>{q}</span><span className="font-mono text-text-tertiary transition-transform group-open:rotate-45">+</span></summary><p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">{a}</p></details>)}</div></div></section>
  </main><SiteFooter/></>;
}
