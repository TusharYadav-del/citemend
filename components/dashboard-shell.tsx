"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { Sidebar, type SidebarItem } from "@/components/ui/sidebar";

const routeTitles: Record<string, string> = {
  "/dashboard": "Command Center",
  "/dashboard/pixel": "Traffic Interceptor",
  "/dashboard/founder-os": "Founder OS",
  "/dashboard/ai-outreach": "AI Outreach",
  "/dashboard/reports/monthly": "Monthly Recovery Report",
};

export function DashboardBreadcrumbs() {
  const pathname = usePathname() ?? "/dashboard";
  const currentTitle = routeTitles[pathname] ?? "Workspace";
  const isOverview = pathname === "/dashboard";

  return (
    <nav aria-label="Breadcrumb" className="flex min-h-12 items-center border-b border-border px-4 text-xs sm:px-6 lg:px-8 print:hidden">
      <ol className="flex min-w-0 items-center gap-2">
        {isOverview
          ? <li className="truncate font-medium text-foreground" aria-current="page">{currentTitle}</li>
          : <><li><Link href="/dashboard" className="rounded-sm text-text-tertiary hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">Command Center</Link></li><li aria-hidden="true" className="text-text-tertiary">/</li><li className="truncate font-medium text-foreground" aria-current="page">{currentTitle}</li></>}
      </ol>
    </nav>
  );
}

export function DashboardShell({ items, children, brand = "CITEMEND" }: { items: SidebarItem[]; children: ReactNode; brand?: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground print:bg-transparent print:text-black">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col bg-background lg:flex-row print:bg-transparent">
        <Sidebar items={items} brand={brand} />
        <div className="min-w-0 flex-1">
          <DashboardBreadcrumbs />
          {children}
        </div>
      </div>
    </div>
  );
}
