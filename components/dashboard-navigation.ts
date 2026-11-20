import type { SidebarItem } from "@/components/ui/sidebar";

export const DEFAULT_DASHBOARD_NAV: SidebarItem[] = [
  { label: "Overview", href: "/dashboard", group: "Core" },
  { label: "AI Scanner", href: "/dashboard/scanner", group: "Core" },
  { label: "Recovery Center", href: "/dashboard/recovery", group: "Defend & Optimize" },
  { label: "GEO & Claims", href: "/dashboard/geo", group: "Defend & Optimize" },
  { label: "AI Analytics", href: "/dashboard/analytics", group: "Defend & Optimize" },
  { label: "Reports", href: "/dashboard/reports", group: "Prove & Grow" },
  { label: "Outreach", href: "/dashboard/outreach", group: "Prove & Grow" },
  { label: "Settings & API", href: "/dashboard/settings", group: "Workspace" },
  { label: "Billing", href: "/dashboard/billing", group: "Workspace" },
  { label: "Traffic Interceptor", href: "/dashboard/pixel", group: "More tools" },
];

export const FOUNDER_DASHBOARD_NAV: SidebarItem[] = [
  ...DEFAULT_DASHBOARD_NAV,
  { label: "Founder OS", href: "/dashboard/founder-os", group: "Founder" },
  { label: "AI Outreach", href: "/dashboard/ai-outreach", group: "Founder" },
];
