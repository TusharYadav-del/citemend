"use client";
import { useRouter } from "next/navigation";

export default function DomainSwitcher({ domains, selected }: { domains: string[]; selected: string }) {
  const router = useRouter();
  if (!domains.length) return null;
  return <label className="flex items-center gap-2 text-xs text-slate-400">Workspace <select aria-label="Switch workspace domain" value={selected} onChange={event => router.push(event.target.value ? `/dashboard?domain=${encodeURIComponent(event.target.value)}` : "/dashboard")} className="max-w-52 rounded-lg border border-white/10 bg-[#101719] px-3 py-2 text-sm text-white"><option value="">All domains</option>{domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}</select></label>;
}
