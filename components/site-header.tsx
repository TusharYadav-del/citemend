import Link from "next/link";
import { ArrowUpRight, Link2 } from "lucide-react";

const navigation = [
  ["Platform", "/#workflow"],
  ["Live Auditor", "/#free-provenance-auditor"],
  ["Pricing", "/pricing"],
  ["FAQ", "/#faq"],
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="CiteMend home" className="inline-flex shrink-0 items-center gap-2.5 rounded-sm text-base font-semibold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-accent">
          <span className="grid size-8 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent"><Link2 aria-hidden="true" className="size-4 -rotate-45" /></span>
          CiteMend<span className="-ml-2 text-accent">.</span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-6 md:flex">
          {navigation.map(([label, href]) => <Link key={label} href={href} className="rounded-sm py-2 text-sm text-text-secondary transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">{label}</Link>)}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link href="/dashboard" className="hidden min-h-10 items-center rounded-md px-3 text-sm font-medium text-text-secondary transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent sm:inline-flex">Sign in</Link>
          <Link href="/pricing" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent sm:px-4">
            <span className="hidden sm:inline">Start $149 Pilot</span><span className="sm:hidden">Start pilot</span><ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
      <nav aria-label="Mobile navigation" className="flex gap-5 overflow-x-auto border-t border-border px-4 py-2.5 text-xs text-text-secondary md:hidden sm:px-6">
        {navigation.map(([label, href]) => <Link key={label} href={href} className="shrink-0 rounded-sm py-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">{label}</Link>)}
      </nav>
    </header>
  );
}
