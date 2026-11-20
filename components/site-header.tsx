import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteAuthActions } from "@/components/site-auth-actions";

const navigation = [["Product", "/#platform"], ["Live Auditor", "/#free-provenance-auditor"], ["Pricing", "/pricing"]] as const;

function Mark() {
  return <span aria-hidden="true" className="grid size-8 place-items-center rounded-md border border-border bg-surface-raised shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"><svg viewBox="0 0 24 24" fill="none" className="size-4"><path d="M5 7h8a4 4 0 0 1 0 8H9m10 2H11a4 4 0 0 1 0-8h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="m7 4-3 3 3 3m10 10 3-3-3-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}

export function SiteHeader() {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  return <header className="sticky top-0 z-40 border-b border-border bg-[#08090A]/80 backdrop-blur-xl">
    <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
      <Link href="/" aria-label="CiteMend home" className="inline-flex shrink-0 items-center gap-2.5 rounded-sm text-base font-semibold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-accent"><Mark/>CiteMend</Link>
      <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">{navigation.map(([label,href])=><Link key={label} href={href} className="rounded-sm py-2 text-[13px] text-text-secondary transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">{label}</Link>)}</nav>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">{clerkConfigured ? <SiteAuthActions/> : <><Link href="/sign-in" className="hidden min-h-10 items-center rounded-md px-3 text-sm font-medium text-text-secondary transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent sm:inline-flex">Sign in</Link><Link href="/pricing" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent sm:px-4"><span>Start $149 Pilot</span><ArrowUpRight className="size-4"/></Link></>}</div>
    </div>
    <nav aria-label="Mobile navigation" className="flex gap-5 overflow-x-auto border-t border-border px-4 py-2.5 text-xs text-text-secondary md:hidden sm:px-6">{navigation.map(([label,href])=><Link key={label} href={href} className="shrink-0 rounded-sm py-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">{label}</Link>)}</nav>
  </header>;
}
