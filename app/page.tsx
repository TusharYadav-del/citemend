import type { Metadata } from "next";
import { Activity, ArrowDownRight, ArrowRight, Check, CircleHelp, FileSearch, Link2, Radar, ShieldCheck, Waypoints } from "lucide-react";
import AuditDashboard from "@/components/audit-dashboard";
import { MarketingRecoveryPreview } from "@/components/marketing-recovery-preview";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { FreeProvenanceAuditor } from "@/components/free-provenance-auditor";
import { PublicPricingPlans } from "@/components/public-pricing-plans";

export const metadata: Metadata = {
  title: "CiteMend | AI Search Recovery Infrastructure",
  description: "Find broken URLs in AI search answers, verify the evidence, and review recovery actions before deployment.",
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", title: "CiteMend | AI Search Recovery Infrastructure", description: "Find broken URLs in AI search answers, verify the evidence, and review recovery actions before deployment." },
  twitter: { card: "summary_large_image", title: "CiteMend | AI Search Recovery Infrastructure", description: "Find broken URLs in AI search answers, verify the evidence, and review recovery actions before deployment." },
};

const workflow = [
  { number: "01", title: "Detect", icon: Radar, description: "Run a saved, search-grounded audit against buyer questions and review the sources it returned." },
  { number: "02", title: "Prove", icon: FileSearch, description: "Inspect URL status, source evidence, and the reason a finding needs attention." },
  { number: "03", title: "Recover", icon: Link2, description: "Review a destination suggestion. A person approves any redirect before it is published." },
  { number: "04", title: "Verify", icon: ShieldCheck, description: "Check the deployed redirect and destination response as separate technical outcomes." },
  { number: "05", title: "Measure", icon: Activity, description: "Record later citation, referral, and attribution evidence only when it is actually observed." },
];

const evidence = [
  { label: "URL response", value: "HTTP check required", note: "Status and transient failures stay distinct." },
  { label: "Recovery action", value: "Approval required", note: "Suggestions do not publish themselves." },
  { label: "AI citation", value: "Re-observation required", note: "A deployed redirect is not proof of a new citation." },
  { label: "Outcome record", value: "Unknown until observed", note: "Traffic and attribution require recorded evidence." },
];

const questions = [
  { q: "Can CiteMend control what AI systems say?", a: "No. CiteMend reviews search-grounded results and their URLs. Engine comparison profiles are modeled from shared search sources; they do not query each named engine directly." },
  { q: "Will CiteMend publish a redirect automatically?", a: "No. A person reviews the destination and approves a redirect before it can be published or synced." },
  { q: "What does the free page check do?", a: "It checks one public HTTP(S) page for its response, crawler access, navigation links, and basic metadata. Archive context is checked only for confirmed 404 or 410 responses." },
  { q: "Does a verified redirect mean an AI citation was recovered?", a: "No. Redirect deployment, destination response, later AI citation, referral traffic, and revenue attribution are separate evidence milestones." },
];

export default function Home() {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

  return <>
    <SiteHeader />
    <main className="overflow-hidden bg-background text-foreground">
      <section id="top" className="relative border-b border-border">
        <div aria-hidden="true" className="cm-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="cm-container relative grid min-w-0 gap-9 py-10 sm:py-14 lg:grid-cols-[.86fr_1.14fr] lg:items-center lg:gap-12 lg:py-20">
          <div className="max-w-2xl">
            <p className="cm-kicker flex items-center gap-2"><span aria-hidden="true" className="size-1.5 rounded-full bg-accent" /> COMMERCE RELIABILITY & CITATION PROVENANCE</p>
            <h1 className="mt-5 max-w-[11ch] text-[clamp(3rem,7vw,5.5rem)] font-semibold leading-[.93] tracking-[-.065em]">Stop losing AI citations and revenue to broken links and stale facts.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-text-secondary sm:text-lg sm:leading-8">Find broken AI citations and inspect cited URLs: CiteMend detects dead destinations and stale AI claims, blocks SEO-harming soft-404 redirects, and helps teams review fixes before Shopify or Cloudflare deployment.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="/pricing" className="cm-button-primary cm-focus-ring">Start $149 Pilot <ArrowRight aria-hidden="true" className="size-4" /></a>
              <a href="#workflow" className="cm-button-secondary cm-focus-ring">Explore the workflow <ArrowDownRight aria-hidden="true" className="size-4" /></a>
            </div>
            <div className="mt-7 grid max-w-xl gap-2 border-t border-border pt-5 text-xs text-text-tertiary sm:grid-cols-3">
              <p className="flex items-center gap-2"><Check aria-hidden="true" className="size-3.5 shrink-0 text-success" />Evidence before action</p>
              <p className="flex items-center gap-2"><Check aria-hidden="true" className="size-3.5 shrink-0 text-success" />Human-approved redirects</p>
              <p className="flex items-center gap-2"><Check aria-hidden="true" className="size-3.5 shrink-0 text-success" />Outcomes tracked separately</p>
            </div>
          </div>
          <div className="min-w-0 lg:pl-2">
            <MarketingRecoveryPreview embedded />
            <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[.12em] text-text-tertiary">Illustrative workflow · no live customer data</p>
          </div>
        </div>
        <div className="cm-container pb-8 sm:pb-10">
          <div className="grid overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5 sm:gap-px">
            {workflow.map(({ number, title }) => <a key={number} href="#workflow" className="flex items-center gap-3 bg-surface px-4 py-3 transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent sm:block sm:px-4 sm:py-4"><span className="font-mono text-[10px] text-accent">{number}</span><span className="text-sm font-medium text-foreground sm:mt-1 sm:block">{title}</span></a>)}
          </div>
        </div>
      </section>

      <FreeProvenanceAuditor />

      <section id="architecture" className="border-y border-border bg-surface py-[var(--space-section)]" aria-labelledby="architecture-title">
        <div className="cm-container"><div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr] lg:items-end"><div><p className="cm-kicker">Platform architecture</p><h2 id="architecture-title" className="mt-4 max-w-xl text-3xl font-semibold tracking-[-.05em] sm:text-5xl">A recovery system built around source evidence.</h2></div><p className="max-w-2xl text-sm leading-7 text-text-secondary">Find broken AI citations and inspect cited URLs in a focused recovery workflow, with roadmap items called out separately from capabilities available today.</p></div>
          <div className="mt-8 grid overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-3 sm:gap-px">
            {[
              ["01", "CiteMend Recovery", "LIVE", "Defensive URL recovery, human review, and supported redirect deployment."],
              ["02", "CiteMend Intelligence", "LIVE", "Claim differences, freshness signals, and extractability evidence."],
              ["03", "CiteMend AI Analytics", "LIVE", "Retrieved and rendered URL provenance where recorded."],
              ["04", "CiteMend Catalog", "ROADMAP", "Product catalog reliability workflows."],
              ["05", "CiteMend Agent Reliability", "ROADMAP", "Expanded agent-facing reliability controls."],
              ["06", "CiteMend Enterprise", "ROADMAP", "Enterprise administration and governance."],
            ].map(([number,title,status,description]) => <article key={number} className="min-w-0 bg-background p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><span className="font-mono text-[10px] text-text-tertiary">{number} / PLATFORM</span><span className={`rounded-sm border px-2 py-1 font-mono text-[9px] tracking-wider ${status === "LIVE" ? "border-success/25 bg-success/5 text-success" : "border-border-strong bg-surface text-text-tertiary"}`}>{status}</span></div><h3 className="mt-5 text-base font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-text-secondary">{description}</p></article>)}
          </div>
        </div>
      </section>
      <section id="workflow" className="cm-container scroll-mt-24 py-[var(--space-section)]" aria-labelledby="workflow-title">
        <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
          <div><p className="cm-kicker">The recovery lifecycle</p><h2 id="workflow-title" className="mt-4 max-w-xl text-3xl font-semibold tracking-[-.05em] sm:text-5xl">Every step leaves evidence your team can inspect.</h2></div>
          <p className="max-w-2xl text-sm leading-7 text-text-secondary sm:text-base">Move from a cited URL to a reviewed action with a clear record of what was checked, what changed, and what still needs observation.</p>
        </div>
        <div className="mt-10 overflow-hidden rounded-xl border border-border bg-surface">
          {workflow.map(({ number, title, icon: Icon, description }) => <article key={number} className="grid gap-3 border-b border-border p-5 last:border-b-0 sm:grid-cols-[5rem_13rem_1fr] sm:items-center sm:gap-5 sm:px-6 sm:py-5">
            <div className="flex items-center gap-3 sm:block"><span className="font-mono text-xs text-accent">{number}</span><span className="grid size-9 place-items-center rounded-md border border-border bg-surface-raised text-accent sm:mt-3"><Icon aria-hidden="true" className="size-4" /></span></div>
            <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            <p className="max-w-2xl text-sm leading-6 text-text-secondary">{description}</p>
          </article>)}
        </div>
      </section>

      <section className="border-y border-border bg-surface py-[var(--space-section)]" aria-labelledby="evidence-title">
        <div className="cm-container grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div><p className="cm-kicker">A measured recovery</p><h2 id="evidence-title" className="mt-4 max-w-xl text-3xl font-semibold tracking-[-.05em] sm:text-5xl">A redirect is one checkpoint. Recovery takes evidence.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-text-secondary sm:text-base">CiteMend keeps technical deployment, destination health, citation re-observation, referral traffic, and revenue attribution distinct. Unknown stays unknown.</p><a href="/security" className="cm-focus-ring mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-accent hover:underline">Review product safeguards <ArrowRight aria-hidden="true" className="size-4" /></a></div>
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5"><div className="flex items-center gap-2"><Waypoints aria-hidden="true" className="size-4 text-accent" /><h3 className="text-sm font-semibold">Evidence ledger</h3></div><span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">Illustrative states · no live data</span></div>
            <div className="divide-y divide-border">{evidence.map((row, index) => <div key={row.label} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-4 sm:px-5"><div><p className="text-sm font-medium">{row.label}</p><p className="mt-1 text-xs leading-5 text-text-tertiary">{row.note}</p></div><span className={`rounded-sm border px-2 py-1 font-mono text-[10px] ${index === 1 ? "border-warning/25 bg-warning/5 text-warning" : "border-border-strong bg-surface text-text-secondary"}`}>{row.value}</span></div>)}</div>
          </div>
        </div>
      </section>



      <section id="audit" className="cm-surface-light scroll-mt-12 border-y border-border px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl"><div className="mx-auto mb-9 max-w-2xl text-center"><p className="font-mono text-xs font-medium uppercase tracking-[.12em] text-foreground/70">Workspace audit</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.045em] text-foreground sm:text-5xl">Start with the questions your buyers ask.</h2><p className="mt-4 text-base leading-7 text-muted-foreground">Sign in to review saved search-grounded sources, URL states, and findings for your domain.</p></div><AuditDashboard liveEnabled={clerkConfigured} clerkConfigured={clerkConfigured} embedded /></div>
      </section>

      <PublicPricingPlans />

      <section id="faq" className="cm-container scroll-mt-24 py-[var(--space-section)]" aria-labelledby="faq-heading">
        <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:gap-12">
          <div><p className="cm-kicker">Clarity before you connect</p><h2 id="faq-heading" className="mt-4 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Evidence over promises.</h2><p className="mt-4 text-base leading-7 text-text-secondary">Inspect every finding, preserve human approval, and report only outcomes supported by an observation.</p></div>
          <div className="space-y-2">{questions.map(({ q, a }) => <details key={q} className="group rounded-md border border-border bg-surface px-4 py-4 sm:px-5"><summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-5 text-sm font-semibold text-foreground marker:content-none focus-visible:outline-2 focus-visible:outline-accent"><span>{q}</span><CircleHelp aria-hidden="true" className="size-4 shrink-0 text-accent transition-transform group-open:rotate-12" /></summary><p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">{a}</p></details>)}</div>
        </div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
