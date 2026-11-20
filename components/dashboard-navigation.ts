import type { SidebarItem } from "@/components/ui/sidebar";

export const DEFAULT_DASHBOARD_NAV: SidebarItem[] = [
  { label: "Overview", href: "/dashboard" },
  { label: "AI Scanner", href: "/dashboard#ai-scanner" },
  { label: "Recovery Center", href: "/dashboard#recovery-command" },
  { label: "Traffic Interceptor", href: "/dashboard/pixel" },
  { label: "Competitor Intelligence", href: "/dashboard#competitor-intelligence" },
  { label: "Outreach", href: "/dashboard#outreach" },
  { label: "GEO Optimizer", href: "/dashboard#geo-optimizer" },
  { label: "AI Visibility", href: "/dashboard#ai-visibility" },
  { label: "Reports", href: "/dashboard#audit-history" },
  { label: "Automations", href: "/dashboard#automations" },
  { label: "Workspaces", href: "/dashboard#workspaces" },
];

export const FOUNDER_DASHBOARD_NAV: SidebarItem[] = [
  ...DEFAULT_DASHBOARD_NAV,
  { label: "Founder OS", href: "/dashboard/founder-os" },
  { label: "AI Outreach", href: "/dashboard/ai-outreach" },
];
