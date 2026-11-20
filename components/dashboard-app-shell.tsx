"use client";

import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { DEFAULT_DASHBOARD_NAV } from "@/components/dashboard-navigation";
import { WorkspaceProvider, useWorkspace } from "@/components/workspace-provider";

function Frame({ children, canScan, canApprove }: { children: ReactNode; canScan: boolean; canApprove: boolean }) {
  const pathname = usePathname();
  const { domains, activeDomain, setActiveDomain } = useWorkspace();
  const title = DEFAULT_DASHBOARD_NAV.find(item => item.href === pathname)?.label ?? (pathname === "/dashboard" ? "Overview" : "Workspace");
  return <div className="min-h-screen bg-background text-foreground lg:flex"><Sidebar items={DEFAULT_DASHBOARD_NAV} /><div className="min-w-0 flex-1">
    <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur sm:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3"><div><p className="font-mono text-[9px] uppercase tracking-[.15em] text-accent">CiteMend / Workspace</p><h1 className="text-sm font-semibold">{title}</h1></div>{domains.length > 0 && <label className="flex items-center gap-1 text-[10px] text-text-secondary sm:gap-2 sm:text-[11px]">Domain<select aria-label="Select active workspace domain" value={activeDomain} onChange={event => setActiveDomain(event.target.value)} className="max-w-28 rounded-md border border-border bg-surface-raised px-1.5 py-1.5 text-[10px] text-foreground sm:max-w-48 sm:px-2 sm:text-xs">{domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}</select></label>}</div>
      <div className="flex items-center gap-2"><CommandPalette items={DEFAULT_DASHBOARD_NAV} domains={domains} selectedDomain={activeDomain} canScan={canScan} canApprove={canApprove} /><UserButton /></div>
    </header><main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
  </div></div>;
}

export function DashboardAppShell({ domains, initialDomain, canScan, canApprove, children }: { domains: string[]; initialDomain: string; canScan: boolean; canApprove: boolean; children: ReactNode }) {
  return <WorkspaceProvider domains={domains} initialDomain={initialDomain}><Frame canScan={canScan} canApprove={canApprove}>{children}</Frame></WorkspaceProvider>;
}
