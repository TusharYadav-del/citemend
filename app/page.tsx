import type { Metadata } from "next";
import { Activity, ArrowRight, Bot, Check, ChevronRight, CircleHelp, Code2, FileSearch, Globe2, Radar, ShieldCheck, ShoppingBag, Sparkles, Workflow, Zap } from "lucide-react";
import AuditDashboard from "@/components/audit-dashboard";
import LandingPreview from "@/components/landing-preview";
import LiveInterceptorDemo from "@/components/LiveInterceptorDemo";
import CitationNetwork from "@/components/citation-network";
import { MarketingRecoveryPreview } from "@/components/marketing-recovery-preview";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { FreeProvenanceAuditor } from "@/components/free-provenance-auditor";
import { PublicPricingPlans } from "@/components/public-pricing-plans";

export const metadata: Metadata = {
  title: "CiteMend | Evidence-led AI Citation Recovery",
  description: "Find broken AI citations, inspect cited URLs, confirm destination status, and review evidence-backed recovery actions. Redirects require approval.",
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", title: "CiteMend | Evidence-led AI Citation Recovery", description: "Find broken AI citations, inspect cited URLs, and review evidence-backed recovery actions." },
  twitter: { card: "summary_large_image", title: "CiteMend | Evidence-led AI Citation Recovery", description: "Find broken AI citations, inspect cited URLs, and review evidence-backed recovery actions." },
};

const pillars = [
  { number: "01", name: "CiteMend Recovery", stage: "LIVE CORE", icon: FileSearch, description: "Find high-intent broken URLs, map verified destinations with soft-404 guardrails, deploy approved redirects, and recover traffic." },
  { number: "02", name: "CiteMend Intelligence", stage: "EARLY ACCESS", icon: ShieldCheck, description: "Detect outdated prices, inventory mismatches, and policy discrepancies." },
  { number: "03", name: "CiteMend AI Analytics", stage: "INCLUDED IN RECOVERY", icon: Activity, description: "Measure AI assistant referrals, recovered sessions, and revenue attribution." },
  { number: "04", name: "CiteMend Catalog", stage: "ROADMAP", icon: ShoppingBag, description: "Maintain accurate product feeds, structured data, SKUs, and availability." },
  { number: "05", name: "CiteMend Agent Reliability", stage: "ROADMAP", icon: Bot, description: "Monitor agent-commerce checkouts (OpenAI ACP / Google UCP) and transaction consistency." },
  { number: "06", name: "CiteMend Enterprise", stage: "ROADMAP", icon: Globe2, description: "Global APIs, multi-store agency management, and enterprise governance." },
];

const features = [
  { icon: Radar, title: "AI citation monitoring", text: "Audit buyer questions against search grounded results, then inspect the URLs and evidence behind each finding." },
  { icon: FileSearch, title: "Broken citation recovery", text: "Confirm dead links with HTTP checks and review a live, same domain replacement before making a change." },
  { icon: Activity, title: "Broken-Source Outreach", text: "Find publisher links to dead external resources, map a relevant replacement on your site, and request a link update." },
  { icon: Globe2, title: "Listicles and source mapping", text: "Trace cited roundups and Reddit threads to understand where category answers are coming from." },
  { icon: ShieldCheck, title: "Entity and pricing truth", text: "Compare saved pricing facts with answer text and prepare a reviewable structured data patch." },
  { icon: Sparkles, title: "Citation capsules", text: "Draft grounded, reusable answer content from your own site evidence." },
  { icon: Code2, title: "A public llms.txt", text: "Publish a useful, maintained view of your product pages, guides, and known deprecated paths." },
  { icon: Workflow, title: "Redirect sync", text: "Export or sync approved 301 redirects for Shopify and common hosting platforms." },
  { icon: Bot, title: "Engine comparison", text: "Compare separate synthesis profiles grounded in shared search sources. Profiles are modeled and do not query each named engine directly." },
];

const questions = [
  { q: "Can CiteMend control what AI systems say?", a: "No. CiteMend checks search grounded answers and cited URLs, then shows evidence you can review. Engine comparison profiles are modeled from shared search results, not direct native queries." },
  { q: "Will CiteMend publish a redirect automatically?", a: "No. Review the suggested destination and approve a redirect before publishing or syncing it." },
  { q: "What does the free preview check?", a: "The public preview checks your homepage and default sitemap availability. A signed in account can run a saved citation audit, subject to the configured account allowance." },
  { q: "Can I share a report with a client?", a: "Yes. Shareable audit reports can include your agency branding and booking call to action when white label access is enabled." },
];

export default function Home() {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  return <>
    <SiteHeader />
    <main className="bg-background text-foreground">

    <section id="top" className="relative isolate border-b border-border">
      <div aria-hidden="true" className="cm-grid pointer-events-none absolute inset-0 -z-20" />
      <div className="cm-container grid min-w-0 items-center gap-8 overflow-x-hidden py-10 sm:py-14 lg:grid-cols-[1.04fr_.96fr] lg:gap-12 lg:py-16">
        <div className="cm-reveal">
          <p className="cm-kicker flex flex-wrap items-center gap-2 break-words"><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" /> Evidence-led citation recovery for B2B teams</p>
          <h1 className="mt-5 max-w-[44rem] break-words text-[clamp(2.7rem,7.2vw,5rem)] font-semibold leading-[.99] tracking-[-.06em]">Find broken AI citations. Repair the destination. Verify the result.</h1>
          <p className="mt-5 max-w-xl break-words text-base leading-7 text-text-secondary">CiteMend helps teams repair broken citations from AI search answers by finding URLs to their domain, confirming which destinations are broken, and reviewing recovery options grounded in observable evidence.</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-text-tertiary">For SEO agencies and B2B SaaS teams managing content libraries and website migrations.</p>
          <div className="mt-6 max-w-xl"><LandingPreview /></div>
          <div className="mt-5 flex flex-wrap gap-3"><a href="#free-provenance-auditor" className="cm-button-primary cm-focus-ring">Check a public page <ArrowRight aria-hidden="true" className="size-4" /></a><a href="#how-it-works" className="cm-button-secondary cm-focus-ring">See how it works <ChevronRight aria-hidden="true" className="size-4" /></a></div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-tertiary"><span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" className="size-4 text-success" />Evidence-backed checks</span><span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" className="size-4 text-success" />No automatic redirects</span><span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" className="size-4 text-success" />Start with your own domain</span></div>
        </div>
        <div className="cm-reveal cm-reveal-delay relative min-w-0">
          <MarketingRecoveryPreview embedded />
        </div>
      </div>
      <div className="cm-container pb-10 sm:pb-14"><div className="grid overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3 md:gap-px"><div className="bg-surface px-5 py-4 sm:px-6"><p className="font-mono text-[10px] font-medium uppercase tracking-[.12em] text-accent">01 / Find</p><p className="mt-1.5 text-sm font-medium text-foreground">What answers cite your domain?</p></div><div className="bg-surface px-5 py-4 sm:px-6"><p className="font-mono text-[10px] font-medium uppercase tracking-[.12em] text-accent">02 / Verify</p><p className="mt-1.5 text-sm font-medium text-foreground">Which destinations are truly broken?</p></div><div className="bg-surface px-5 py-4 sm:px-6"><p className="font-mono text-[10px] font-medium uppercase tracking-[.12em] text-accent">03 / Recover</p><p className="mt-1.5 text-sm font-medium text-foreground">What evidence supports a recovery action?</p></div></div></div>
    </section>

    <section id="architecture" className="cm-container py-[var(--space-section)]" aria-labelledby="architecture-heading">
      <div className="mb-8 max-w-3xl sm:mb-10"><p className="cm-kicker">Product scope</p><h2 id="architecture-heading" className="mt-4 text-3xl font-semibold tracking-[-.045em] sm:text-5xl">One recovery workflow. Clear availability at every stage.</h2><p className="mt-4 text-base leading-7 text-text-secondary">Start with the live recovery workflow. Other capabilities are labeled by their current availability.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{pillars.map(({ number, name, stage, icon: Icon, description }) => <article key={number} className="flex h-full min-w-0 flex-col rounded-lg border border-border bg-surface p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-md border border-accent/25 bg-accent/10 text-accent"><Icon aria-hidden="true" className="size-5" /></span><span className="cm-mono text-xs tabular-nums text-text-tertiary">{number}</span></div><p className="mt-5 font-mono text-[10px] font-medium uppercase tracking-[.12em] text-text-secondary">{stage}</p><h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">{name}</h3><p className="mt-2.5 text-sm leading-6 text-text-secondary">{description}</p></article>)}</div>
    </section>

    <section id="platform" className="cm-container py-[var(--space-section)]">
      <div className="mb-12 grid gap-7 lg:grid-cols-[.8fr_1.2fr] lg:items-end"><div><p className="cm-kicker">A connected workflow</p><h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-[-.055em] sm:text-5xl">Make every AI mention lead somewhere useful.</h2></div><p className="max-w-xl text-sm leading-7 text-text-secondary">Start with a buyer question. Inspect the answer sources, verify every destination, and turn confirmed problems into reviewable recovery actions.</p></div>
      <div className="grid items-stretch gap-5 lg:grid-cols-[1.08fr_.92fr]"><CitationNetwork /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{features.slice(0, 4).map(({ icon: Icon, title, text }, index) => <article key={title} className="cm-panel flex gap-4 !rounded-2xl p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/15 bg-cyan-300/[.07] text-accent"><Icon className="size-[18px]" /></span><div><div className="flex items-center gap-2"><span className="cm-mono text-[9px] text-text-tertiary">0{index + 1}</span><h3 className="text-sm font-semibold text-foreground">{title}</h3></div><p className="mt-1.5 text-xs leading-5 text-text-secondary">{text}</p></div></article>)}</div></div>
    </section>

    <section id="how-it-works" className="border-y border-border bg-surface py-[var(--space-section)]">
      <div className="cm-container"><div className="max-w-2xl"><p className="cm-kicker">From answer to arrival</p><h2 className="mt-4 text-3xl font-semibold tracking-[-.055em] sm:text-5xl">A clear path from discovery to a fix.</h2></div><div className="mt-11 grid gap-4 md:grid-cols-3">{[{ icon: Radar, title: "Discover", text: "Run a search grounded audit with prompts your buyers actually ask." }, { icon: ShieldCheck, title: "Verify", text: "Check citations with real HTTP results. Unknown stays unknown." }, { icon: Zap, title: "Recover", text: "Review live replacements, approve a 301, then export or sync it." }].map(({ icon: Icon, title, text }, index) => <article key={title} className="group relative overflow-hidden rounded-[1.4rem] border border-border bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/25"><div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-cyan-300/[.08] text-accent"><Icon className="size-5" /></span><span className="cm-mono text-[10px] text-text-tertiary">0{index + 1}</span></div><h3 className="mt-7 text-lg font-semibold tracking-tight">{title}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{text}</p><div className="mt-6 h-px bg-gradient-to-r from-cyan-300/40 to-transparent" /></article>)}</div></div>
    </section>

    <section className="cm-container py-[var(--space-section)]"><div className="mb-10 flex flex-wrap items-end justify-between gap-5"><div className="max-w-2xl"><p className="cm-kicker">One command center</p><h2 className="mt-4 text-3xl font-semibold tracking-[-.055em] sm:text-5xl">The recovery work, in one place.</h2></div><p className="max-w-lg text-sm leading-7 text-text-secondary">A focused toolkit for teams who want evidence, approvals, and clear handoffs instead of another black box score.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{features.slice(4).map(({ icon: Icon, title, text }) => <article key={title} className="cm-panel group !rounded-2xl p-5 transition hover:border-cyan-300/25"><span className="grid size-10 place-items-center rounded-xl border border-border bg-surface-raised text-accent transition group-hover:border-accent/20 group-hover:bg-cyan-300/[.07]"><Icon className="size-[18px]" /></span><h3 className="mt-5 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-6 text-text-secondary">{text}</p></article>)}</div><div className="mt-5 rounded-xl border border-cyan-300/10 bg-cyan-300/[.035] px-4 py-3 text-[11px] leading-5 text-text-secondary">Engine comparison uses separate synthesis profiles over shared search results. It is a modeled comparison, not direct access to ChatGPT Search, Perplexity Sonar, Gemini, or Claude.</div></section>

    <LiveInterceptorDemo />

    <PublicPricingPlans />

    <FreeProvenanceAuditor />
    <section id="audit" className="cm-surface-light scroll-mt-12 border-y border-border px-5 py-16 sm:px-8 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mx-auto mb-9 max-w-2xl text-center"><p className="font-mono text-xs font-medium uppercase tracking-[.12em] text-foreground/70">Authenticated citation audit</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.045em] text-foreground sm:text-5xl">Run a buyer-question audit in your workspace.</h2><p className="mt-4 text-base leading-7 text-muted-foreground">Sign in to review search-grounded sources, confirmed URL states, and saved findings for your domain.</p></div><AuditDashboard liveEnabled={clerkConfigured} clerkConfigured={clerkConfigured} embedded /></div></section>

    <section id="faq" className="cm-container py-[var(--space-section)]" aria-labelledby="faq-heading">
      <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:gap-12">
        <div><p className="cm-kicker">Questions, answered</p><h2 id="faq-heading" className="mt-4 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Clarity before you connect.</h2><p className="mt-4 text-base leading-7 text-text-secondary">AI search changes quickly. Your recovery plan should be based on links and checks you can inspect.</p><a href="#free-provenance-auditor" className="cm-focus-ring mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-accent hover:underline">Check a public page <ArrowRight aria-hidden="true" className="size-4" /></a></div>
        <div className="space-y-2">{questions.map(({ q, a }) => <details key={q} className="group rounded-md border border-border bg-surface px-4 py-4 sm:px-5"><summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-5 text-sm font-semibold text-foreground marker:content-none focus-visible:outline-2 focus-visible:outline-accent"><span>{q}</span><CircleHelp aria-hidden="true" className="size-4 shrink-0 text-accent transition-transform group-open:rotate-12" /></summary><p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">{a}</p></details>)}</div>
      </div>
    </section>

    </main>
    <SiteFooter />
  </>;
}
