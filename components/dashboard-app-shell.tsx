"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu } from "lucide-react";
import { Sidebar } from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { DEFAULT_DASHBOARD_NAV } from "@/components/dashboard-navigation";
import { WorkspaceProvider, useWorkspace } from "@/components/workspace-provider";
import { BackgroundJobsPanel } from "@/components/background-jobs-panel";
import { WorkspaceHealthBadge } from "@/components/workspace-health-badge";

const pages: Record<string, { title: string; group: string }> = {
  "/dashboard": { title: "Overview", group: "Core" },
  "/dashboard/scanner": { title: "AI Scanner", group: "Core" },
  "/dashboard/recovery": { title: "Recovery Center", group: "Defend & Optimize" },
  "/dashboard/geo": { title: "GEO & Claims", group: "Defend & Optimize" },
  "/dashboard/analytics": { title: "AI Analytics", group: "Defend & Optimize" },
  "/dashboard/reports": { title: "Reports", group: "Prove & Grow" },
  "/dashboard/reports/monthly": { title: "Monthly ROI", group: "Prove & Grow" },
  "/dashboard/outreach": { title: "Outreach", group: "Prove & Grow" },
  "/dashboard/settings": { title: "Settings & API", group: "Workspace" },
  "/dashboard/billing": { title: "Billing", group: "Workspace" },
  "/dashboard/pixel": { title: "Traffic Interceptor", group: "More tools" },
  "/dashboard/founder-os": { title: "Founder OS", group: "Founder" },
  "/dashboard/ai-outreach": { title: "AI Outreach", group: "Founder" },
};

function Frame({ children, canScan, canApprove }: { children: ReactNode; canScan: boolean; canApprove: boolean }) {
  const pathname = usePathname();
  const { domains, activeDomain, setActiveDomain } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const page = pages[pathname] ?? { title: "Workspace", group: "CiteMend" };
  return <div className="dashboard-shell min-h-screen bg-background text-foreground lg:flex">
    <Sidebar items={DEFAULT_DASHBOARD_NAV} domains={domains} activeDomain={activeDomain} onSelectDomain={setActiveDomain} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} footer={<div className="space-y-2"><WorkspaceHealthBadge domain={activeDomain}/><div className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-2"><UserButton appearance={{ elements: { avatarBox: "size-8", userButtonPopoverCard: "bg-surface-raised border border-border", userButtonPopoverActionButton: "text-foreground" } }}/><div className="min-w-0"><p className="text-[11px] font-medium text-foreground">Signed in</p><p className="font-mono text-[9px] text-text-tertiary">Account &amp; preferences</p></div></div></div>}/>
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 flex min-h-[4.25rem] flex-wrap items-center justify-between gap-3 border-b border-border bg-background/90 px-3 py-2 backdrop-blur-xl sm:px-5 lg:px-7 print:hidden">
        <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setMobileOpen(true)} aria-label="Open workspace navigation" aria-expanded={mobileOpen} className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-raised text-text-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent lg:hidden"><Menu className="size-4"/></button><div className="min-w-0"><p className="truncate font-mono text-[9px] uppercase tracking-[.15em] text-text-tertiary">Workspace <span className="px-1.5 text-border-strong">/</span>{page.group}</p><h1 className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">{page.title}</h1></div></div>
        <div className="flex shrink-0 items-center gap-2"><CommandPalette items={DEFAULT_DASHBOARD_NAV} domains={domains} selectedDomain={activeDomain} canScan={canScan} canApprove={canApprove}/><div className="hidden sm:block"><BackgroundJobsPanel domain={activeDomain}/></div><Link href="/dashboard/scanner" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent sm:px-3.5 sm:text-sm"><span className="hidden sm:inline">Run Live Audit</span><span className="sm:hidden">Audit</span><ArrowUpRight aria-hidden="true" className="size-4"/></Link></div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-7 lg:px-8">{children}</main>
    </div>
  </div>;
}

export function DashboardAppShell({ domains, initialDomain, canScan, canApprove, children }: { domains: string[]; initialDomain: string; canScan: boolean; canApprove: boolean; children: ReactNode }) {
  return <WorkspaceProvider domains={domains} initialDomain={initialDomain}><Frame canScan={canScan} canApprove={canApprove}>{children}</Frame></WorkspaceProvider>;
}
