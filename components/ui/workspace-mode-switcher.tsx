"use client";

import Link from "next/link";
import { useState } from "react";
import type { WorkspaceRole } from "@/lib/rbac";

const modes = [
  { key: "agency", label: "Agency Portfolio", href: "#workspaces" },
  { key: "saas", label: "B2B SaaS", href: "#ai-visibility" },
  { key: "ecommerce", label: "Ecommerce Catalog", href: "#ecommerce-catalog" },
] as const;

export function WorkspaceModeSwitcher({ role, ecommerceAvailable = true }: { role: WorkspaceRole; ecommerceAvailable?: boolean }) {
  const [selected, setSelected] = useState<(typeof modes)[number]["key"]>("saas");
  const available = modes.filter(mode => (role === "owner" || role === "admin" || mode.key !== "agency") && (ecommerceAvailable || mode.key !== "ecommerce"));
  return <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[.08] bg-white/[.025] p-1" role="group" aria-label="Workspace view mode">
    {available.map(mode => <Link key={mode.key} href={mode.href} onClick={() => setSelected(mode.key)} aria-current={selected === mode.key ? "page" : undefined} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-emerald-300 ${selected === mode.key ? "bg-emerald-300/10 text-emerald-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{mode.label}</Link>)}
    {role === "viewer" && <span className="px-2 text-[10px] text-slate-500">Read only</span>}
  </div>;
}
