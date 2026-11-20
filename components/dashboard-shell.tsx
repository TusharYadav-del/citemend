import type { ReactNode } from "react";
import type { SidebarItem } from "@/components/ui/sidebar";

/** Compatibility wrapper for legacy dashboard pages; the persistent shell now lives in app/dashboard/layout.tsx. */
export function DashboardShell({ children }: { items: SidebarItem[]; children: ReactNode; brand?: string }) {
  return <>{children}</>;
}
