"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { mergeWorkspaceDomain } from "@/lib/workspace-domain";

type WorkspaceContextValue = { domains: string[]; activeDomain: string; setActiveDomain: (domain: string) => void; addWorkspaceDomain: (domain: string) => void };
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ domains, initialDomain, children }: { domains: string[]; initialDomain: string; children: ReactNode }) {
  const [knownDomains, setKnownDomains] = useState(domains);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const requestedDomain = search.get("domain");
  const activeDomain = requestedDomain && knownDomains.includes(requestedDomain) ? requestedDomain : (knownDomains.includes(initialDomain) ? initialDomain : knownDomains[0] ?? "");
  useEffect(() => {
    if (!activeDomain || search.has("domain")) return;
    const params = new URLSearchParams(search.toString());
    params.set("domain", activeDomain);
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeDomain, pathname, router, search]);
  const setActiveDomain = useCallback((domain: string) => {
    if (domain && !knownDomains.includes(domain)) return;
    try { if (domain) localStorage.setItem("citemend:active-domain", domain); else localStorage.removeItem("citemend:active-domain"); } catch {}
    const params = new URLSearchParams(search.toString());
    if (domain) params.set("domain", domain); else params.delete("domain");
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
    document.cookie = `citemend_active_domain=${encodeURIComponent(domain)}; Path=/; SameSite=Lax; Max-Age=31536000`;
  }, [knownDomains, pathname, router, search]);
  const addWorkspaceDomain = useCallback((value: string) => {
    const result = mergeWorkspaceDomain(knownDomains, value);
    setKnownDomains(result.domains);
    try { localStorage.setItem("citemend:active-domain", result.domain); } catch {}
    document.cookie = `citemend_active_domain=${encodeURIComponent(result.domain)}; Path=/; SameSite=Lax; Max-Age=31536000`;
    const params = new URLSearchParams(search.toString());
    params.set("domain", result.domain);
    router.push(`${pathname}?${params.toString()}`);
  }, [knownDomains, pathname, router, search]);
  const value = useMemo(() => ({ domains: knownDomains, activeDomain, setActiveDomain, addWorkspaceDomain }), [knownDomains, activeDomain, setActiveDomain, addWorkspaceDomain]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
