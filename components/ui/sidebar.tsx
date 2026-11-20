"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Activity, BarChart3, Bot, BriefcaseBusiness, CreditCard, FileText, Globe2, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Radar, Search, ShieldCheck, Target, X, Zap, type LucideIcon } from "lucide-react";

export type SidebarItem = { label: string; href: string; active?: boolean };

const groups = [
  { label: "Core & overview", items: ["Overview", "AI Scanner"] },
  { label: "1. Defend · Recovery", items: ["Recovery Center", "Traffic Interceptor"] },
  { label: "2. Win · Acquisition", items: ["Competitor Intelligence", "Outreach"] },
  { label: "3. Optimize · Authority", items: ["GEO Optimizer"] },
  { label: "4. Prove · Intelligence", items: ["AI Visibility", "Reports"] },
  { label: "Workspace", items: ["Automations", "Workspaces", "Billing", "Founder OS", "AI Outreach"] },
] as const;
const icons: Record<string, LucideIcon> = {
  Overview: LayoutDashboard, "AI Scanner": Search, "Recovery Center": ShieldCheck,
  "Traffic Interceptor": Zap, "Competitor Intelligence": Target, Outreach: BriefcaseBusiness,
  "GEO Optimizer": Radar, "AI Visibility": Activity, Reports: FileText,
  Automations: Bot, Workspaces: Globe2, Billing: CreditCard, "Founder OS": BarChart3, "AI Outreach": BriefcaseBusiness,
};

export function Sidebar({ items, brand = "CITEMEND" }: { items: SidebarItem[]; brand?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hash, setHash] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => { if (mobileOpen) closeRef.current?.focus(); }, [mobileOpen]);
  function handleDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { setMobileOpen(false); triggerRef.current?.focus(); }
    if (event.key === "Tab") {
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')];
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
  const active = (item: SidebarItem) => {
    const [path, targetHash] = item.href.split("#");
    if (path.split("?")[0] !== pathname) return false;
    return targetHash ? hash === `#${targetHash}` || (!hash && item.label === "Overview") : true;
  };
  const nav = (compact: boolean, onNavigate?: () => void) => <nav aria-label="Workspace navigation" className="mt-6 space-y-5">
    {groups.map(group => {
      const visible = items.filter(item => (group.items as readonly string[]).includes(item.label));
      if (!visible.length) return null;
      return <div key={group.label}>
        <p className={`mb-1 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-text-tertiary ${compact ? collapsed ? "sr-only" : "hidden xl:block" : ""}`}>{group.label}</p>
        <div className="space-y-0.5">{visible.map(item => {
          const Icon = icons[item.label] ?? Globe2;
          const isActive = active(item);
          return <Link key={item.label} href={item.href} title={compact ? item.label : undefined} aria-label={compact ? item.label : undefined} aria-current={isActive ? "page" : undefined} onClick={() => { setHash(item.href.includes("#") ? `#${item.href.split("#")[1]}` : ""); onNavigate?.(); }} className={`flex min-h-10 items-center gap-3 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-cyan-300 ${item.label === "Recovery Center" ? "border-accent/20" : "border-transparent"} ${isActive ? "bg-cyan-300/10 text-accent" : "text-text-secondary hover:bg-white/[.05] hover:text-foreground"}`}>
            <Icon className="size-4 shrink-0" aria-hidden="true" /><span className={compact ? collapsed ? "sr-only" : "hidden xl:inline" : ""}>{item.label}</span>
          </Link>;
        })}</div>
      </div>;
    })}
  </nav>;
  return <>
    <aside className={`sticky top-0 hidden h-screen shrink-0 overflow-y-auto border-r border-border bg-surface px-2 py-6 transition-[width] duration-200 motion-reduce:transition-none lg:block lg:w-16 print:hidden ${collapsed ? "xl:w-16" : "xl:w-64 xl:px-3"}`}>
      <div className="flex items-center justify-between gap-1 px-1"><Link href="/dashboard" aria-label="CiteMend command center" className="grid size-10 shrink-0 place-items-center rounded-md border border-accent/20 bg-cyan-300/10 font-mono text-xs font-bold text-accent">CM</Link>{!collapsed && <span className="hidden min-w-0 flex-1 truncate text-xs font-bold tracking-[.1em] text-foreground xl:block">{brand}</span>}<button type="button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? "Expand workspace sidebar" : "Collapse workspace sidebar"} aria-expanded={!collapsed} className="hidden size-10 shrink-0 place-items-center rounded-md text-text-secondary hover:bg-surface-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-cyan-300 xl:grid">{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button></div>
      {nav(true)}
    </aside>
    <div className="sticky top-0 z-40 flex min-h-14 items-center border-b border-border bg-surface px-4 lg:hidden print:hidden"><button ref={triggerRef} type="button" onClick={() => setMobileOpen(true)} aria-haspopup="dialog" aria-expanded={mobileOpen} className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-accent"><Menu className="size-5 text-accent" />{brand}<span className="sr-only">Open workspace navigation</span></button></div>
    {mobileOpen && <div className="fixed inset-0 z-50 bg-black/70 lg:hidden print:hidden"><button type="button" aria-label="Close workspace navigation" onClick={() => { setMobileOpen(false); triggerRef.current?.focus(); }} className="absolute inset-0 size-full cursor-default" /><aside role="dialog" aria-modal="true" aria-label="Workspace navigation" onKeyDown={handleDrawerKeyDown} className="absolute inset-y-0 left-0 w-[min(18rem,86vw)] overflow-y-auto border-r border-border bg-surface p-4 shadow-2xl"><div className="flex items-center justify-between"><span className="font-semibold tracking-wide text-foreground">{brand}</span><button ref={closeRef} type="button" onClick={() => { setMobileOpen(false); triggerRef.current?.focus(); }} aria-label="Close workspace navigation" className="grid size-10 place-items-center rounded-md text-text-secondary hover:bg-surface-soft"><X className="size-4" /></button></div>{nav(false, () => setMobileOpen(false))}</aside></div>}
  </>;
}
