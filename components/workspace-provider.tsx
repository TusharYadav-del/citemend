"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type WorkspaceContextValue = { domains: string[]; activeDomain: string; setActiveDomain: (domain: string) => void };
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ domains, initialDomain, children }: { domains: string[]; initialDomain: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const requestedDomain = search.get("domain");
  const activeDomain = requestedDomain && domains.includes(requestedDomain) ? requestedDomain : initialDomain;
  useEffect(() => {
    if (!activeDomain || search.has("domain")) return;
    const params = new URLSearchParams(search.toString());
    params.set("domain", activeDomain);
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeDomain, pathname, router, search]);
  const setActiveDomain = useCallback((domain: string) => {
    if (domain && !domains.includes(domain)) return;
    try { if (domain) localStorage.setItem("citemend:active-domain", domain); else localStorage.removeItem("citemend:active-domain"); } catch {}
    const params = new URLSearchParams(search.toString());
    if (domain) params.set("domain", domain); else params.delete("domain");
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
    document.cookie = `citemend_active_domain=${encodeURIComponent(domain)}; Path=/; SameSite=Lax; Max-Age=31536000`;
  }, [domains, pathname, router, search]);
  const value = useMemo(() => ({ domains, activeDomain, setActiveDomain }), [domains, activeDomain, setActiveDomain]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
