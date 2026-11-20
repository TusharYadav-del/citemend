"use client";
import { useRouter } from "next/navigation";

export default function DomainSwitcher({ domains, selected, label = "Workspace" }: { domains: string[]; selected: string; label?: string }) {
  const router = useRouter();
  if (!domains.length) return null;
  return <label className="flex items-center gap-2 text-xs text-text-secondary">{label} <select aria-label={`Switch ${label.toLowerCase()}`} value={selected} onChange={event => router.push(event.target.value ? `/dashboard?domain=${encodeURIComponent(event.target.value)}` : "/dashboard")} className="max-w-52 rounded-lg border border-border bg-[#101719] px-3 py-2 text-sm text-foreground"><option value="">All workspaces</option>{domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}</select></label>;
}
