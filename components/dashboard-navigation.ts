import type { SidebarItem } from "@/components/ui/sidebar";

export const DEFAULT_DASHBOARD_NAV: SidebarItem[] = [
  { label: "Overview", href: "/dashboard" },
  { label: "AI Scanner", href: "/dashboard/scanner" },
  { label: "Recovery Center", href: "/dashboard/recovery" },
  { label: "GEO Optimizer", href: "/dashboard/geo" },
  { label: "AI Visibility", href: "/dashboard/analytics" },
  { label: "Reports", href: "/dashboard/reports" },
  { label: "Outreach", href: "/dashboard/outreach" },
  { label: "Workspaces", href: "/dashboard/settings" },
  { label: "Billing", href: "/dashboard/billing" },
  { label: "Traffic Interceptor", href: "/dashboard/pixel" },
];

export const FOUNDER_DASHBOARD_NAV: SidebarItem[] = [
  ...DEFAULT_DASHBOARD_NAV,
  { label: "Founder OS", href: "/dashboard/founder-os" },
  { label: "AI Outreach", href: "/dashboard/ai-outreach" },
];
