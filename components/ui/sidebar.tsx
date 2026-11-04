"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

export type SidebarItem = { label: string; href: string; active?: boolean };
export function Sidebar({ items, brand = "CITEMEND" }: { items: SidebarItem[]; brand?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (mobileOpen) closeRef.current?.focus(); }, [mobileOpen]);
  function handleDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { setMobileOpen(false); triggerRef.current?.focus(); }
    if (event.key === "Tab" && event.currentTarget instanceof HTMLElement) {
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')];
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
  const navLinks = (onNavigate?: () => void, compact = collapsed) => <nav aria-label="Workspace navigation" className="mt-8 space-y-1 text-sm">{items.map(item => <Link key={item.label} href={item.href} title={compact ? item.label : undefined} aria-current={item.active ? "page" : undefined} onClick={onNavigate} className={`flex min-h-10 items-center rounded-lg px-3 py-2.5 ${compact ? "justify-center" : ""} ${item.active ? "bg-emerald-400/10 font-semibold text-emerald-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{compact ? <span aria-hidden="true">{item.label.slice(0, 1)}</span> : item.label}</Link>)}</nav>;
  return <>
    <aside className={`hidden shrink-0 border-r border-white/10 bg-black/20 px-3 py-8 transition-[width] duration-200 lg:block ${collapsed ? "w-[4.5rem]" : "w-64 px-5"}`}>
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between gap-2"}`}><Link href="/dashboard" aria-label="CiteMend command center" className="text-sm font-bold tracking-wide text-white">{collapsed ? "CM" : <>{brand}<span className="text-emerald-400"> / COMMAND</span></>}</Link><button type="button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? "Expand workspace sidebar" : "Collapse workspace sidebar"} aria-expanded={!collapsed} className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button></div>
      {navLinks()}
      {!collapsed && <div className="mt-10 rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-xs text-slate-400"><span className="mr-2 inline-block size-2 rounded-full bg-emerald-400" />Systems operational</div>}
    </aside>
    <div className="mb-6 lg:hidden"><button ref={triggerRef} type="button" onClick={() => setMobileOpen(true)} aria-haspopup="dialog" aria-expanded={mobileOpen} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-white/[.03] px-4 text-sm font-medium text-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-400"><span>Workspace navigation</span><PanelLeftOpen className="size-4 text-emerald-300" /></button>{mobileOpen && <div className="fixed inset-0 z-[var(--z-overlay)] bg-black/65 lg:hidden"><button type="button" aria-label="Close workspace navigation" onClick={() => { setMobileOpen(false); triggerRef.current?.focus(); }} className="absolute inset-0 size-full cursor-default" /><aside role="dialog" aria-modal="true" aria-label="Workspace navigation" onKeyDown={handleDrawerKeyDown} className="absolute inset-y-0 left-0 w-[min(19rem,86vw)] overflow-y-auto border-r border-white/10 bg-[#0d1119] p-5 shadow-2xl"><div className="flex items-center justify-between"><Link href="/dashboard" className="text-sm font-bold tracking-wide text-white">{brand}<span className="text-emerald-400"> / COMMAND</span></Link><button ref={closeRef} type="button" onClick={() => { setMobileOpen(false); triggerRef.current?.focus(); }} aria-label="Close workspace navigation" className="grid size-10 place-items-center rounded-lg text-slate-300 hover:bg-white/5"><X className="size-4" /></button></div>{navLinks(() => setMobileOpen(false), false)}</aside></div>}</div>
  </>;
}
