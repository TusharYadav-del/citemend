"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, BarChart3, BriefcaseBusiness, CreditCard, FileText, Globe2, LayoutDashboard, Radar, Search, Settings2, ShieldCheck, Zap, X, type LucideIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

export type SidebarGroup = "Core" | "Defend & Optimize" | "Prove & Grow" | "Workspace" | "More tools" | "Founder";
export type SidebarItem = { label: string; href: string; group?: SidebarGroup; active?: boolean };

const groups: { label: SidebarGroup; items: SidebarGroup[] }[] = [
  { label: "Core", items: ["Core"] },
  { label: "Defend & Optimize", items: ["Defend & Optimize"] },
  { label: "Prove & Grow", items: ["Prove & Grow"] },
  { label: "Workspace", items: ["Workspace"] },
  { label: "More tools", items: ["More tools", "Founder"] },
];
const icons: Record<string, LucideIcon> = {
  Overview: LayoutDashboard, "AI Scanner": Search, "Recovery Center": ShieldCheck,
  "GEO & Claims": Radar, "AI Analytics": Activity, Reports: FileText, Outreach: BriefcaseBusiness,
  "Settings & API": Settings2, Billing: CreditCard, "Traffic Interceptor": Zap,
  "Founder OS": BarChart3, "AI Outreach": BriefcaseBusiness,
};

export function Sidebar({ items, brand = "CITEMEND", domains = [], activeDomain = "", onSelectDomain, mobileOpen = false, onMobileOpenChange, footer }: {
  items: SidebarItem[]; brand?: string; domains?: string[]; activeDomain?: string;
  onSelectDomain?: (domain: string) => void; mobileOpen?: boolean; onMobileOpenChange?: (open: boolean) => void; footer?: ReactNode;
}) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (mobileOpen) drawerCloseRef.current?.focus(); }, [mobileOpen]);
  function handleDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { onMobileOpenChange?.(false); return; }
    if (event.key !== "Tab" || !drawerRef.current) return;
    const controls = [...drawerRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),select:not([disabled])')];
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  const active = (item: SidebarItem) => item.href === "/dashboard" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const onNavigate = () => onMobileOpenChange?.(false);
  const nav = <nav aria-label="Workspace navigation" className="mt-5 space-y-5">{groups.map(group => {
    const visible = items.filter(item => group.items.includes(item.group ?? "More tools"));
    if (!visible.length) return null;
    return <section key={group.label} aria-label={group.label}><h2 className="mb-2 px-3 font-mono text-[9px] font-semibold uppercase tracking-[.15em] text-text-tertiary">{group.label}</h2><div className="space-y-1">{visible.map(item => {
      const Icon = icons[item.label] ?? Globe2; const selected = active(item);
      return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={selected ? "page" : undefined} className={`group/nav relative flex min-h-10 items-center gap-3 overflow-hidden rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${selected ? "bg-white/[.06] text-foreground" : "text-text-secondary hover:bg-white/[.035] hover:text-foreground"}`}><span aria-hidden="true" className={`absolute inset-y-2 left-0 w-[2px] rounded-r-full transition-opacity ${selected ? "bg-accent opacity-100" : "bg-accent opacity-0 group-hover/nav:opacity-50"}`} /><Icon className={`ml-1 size-4 shrink-0 ${selected ? "text-accent-strong" : "text-text-tertiary group-hover/nav:text-text-secondary"}`} aria-hidden="true"/><span className="truncate">{item.label}</span></Link>;
    })}</div></section>;
  })}</nav>;

  const content = <div className="flex h-full min-h-0 flex-col bg-surface px-3 py-4 sm:px-4"><div className="flex items-center gap-3 px-2"><Link href="/dashboard" onClick={onNavigate} aria-label="CiteMend overview" className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-raised text-accent-strong shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4"><path d="M5 7h8a4 4 0 0 1 0 8H9m10 2H11a4 4 0 0 1 0-8h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="m7 4-3 3 3 3m10 10 3-3-3-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></Link><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold tracking-tight text-foreground">{brand}</p><p className="font-mono text-[9px] uppercase tracking-[.13em] text-text-tertiary">Reliability workspace</p></div><button ref={drawerCloseRef} type="button" onClick={onNavigate} aria-label="Close workspace navigation" className="grid size-9 place-items-center rounded-md text-text-secondary hover:bg-surface-soft lg:hidden"><X className="size-4"/></button></div>
    <div className="mt-5 rounded-xl border border-border bg-surface-raised p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]"><div className="flex items-center gap-2.5 px-2 py-1.5"><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-[11px] font-semibold text-text-secondary">{activeDomain ? activeDomain.replace(/^www\./, "").slice(0, 1).toUpperCase() : "—"}</span><div className="min-w-0 flex-1"><p className="font-mono text-[9px] uppercase tracking-wider text-text-tertiary">Active workspace</p>{domains.length ? <select aria-label="Select active workspace domain" value={activeDomain} onChange={event => onSelectDomain?.(event.target.value)} className="mt-0.5 w-full truncate bg-transparent text-xs font-medium text-foreground outline-none"><option value="" className="bg-surface-raised">All workspaces</option>{domains.map(domain => <option className="bg-surface-raised" key={domain} value={domain}>{domain}</option>)}</select> : <p className="mt-0.5 truncate text-xs font-medium text-text-secondary">No domain connected</p>}</div><span aria-hidden="true" className="text-xs text-text-tertiary">⌄</span></div><Link href="/dashboard/scanner" onClick={onNavigate} className="mt-2 flex min-h-8 items-center gap-2 rounded-md px-2 text-[11px] font-medium text-text-secondary transition-colors hover:bg-white/[.05] hover:text-foreground"><span className="text-accent-strong">＋</span>Connect domain</Link></div>
    {nav}<div className="mt-auto border-t border-border pt-3">{footer}</div></div>;

  return <><aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-border print:hidden lg:block">{content}</aside><AnimatePresence>{mobileOpen && <motion.div className="fixed inset-0 z-[80] lg:hidden print:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}><button type="button" aria-label="Close workspace navigation" onClick={() => onMobileOpenChange?.(false)} className="absolute inset-0 size-full cursor-default bg-black/70 backdrop-blur-sm"/><motion.aside ref={drawerRef} role="dialog" aria-modal="true" aria-label="Workspace navigation" onKeyDown={handleDrawerKeyDown} initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }} className="absolute inset-y-0 left-0 w-[min(19rem,88vw)] border-r border-border shadow-2xl">{content}</motion.aside></motion.div>}</AnimatePresence></>;
}
