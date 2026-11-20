"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

type Health = { overall?: "operational" | "partial" | "degraded"; checkedAt?: string };

export function WorkspaceHealthBadge({ domain }: { domain?: string }) {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const response = await fetch("/api/health/status", { cache: "no-store" });
        const result = await response.json() as Health;
        if (mounted) setHealth(result);
      } catch { if (mounted) setHealth({ overall: "degraded" }); }
    };
    void check(); const timer = window.setInterval(() => void check(), 60_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);
  const tone = health?.overall === "operational" ? "bg-success" : health?.overall ? "bg-warning" : "bg-text-tertiary";
  const label = !health ? "Checking system" : health.overall === "operational" ? "Systems operational" : health.overall === "partial" ? "Partial service" : "Service degraded";
  return <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-2" title={health?.checkedAt ? `Last checked ${new Date(health.checkedAt).toLocaleTimeString()}` : undefined}><span className={`size-1.5 shrink-0 rounded-full ${tone}`} /><Activity aria-hidden="true" className="size-3.5 shrink-0 text-text-tertiary"/><span className="min-w-0"><span className="block truncate text-[10px] font-medium text-foreground">{label}</span><span className="block truncate font-mono text-[9px] text-text-tertiary">{domain || "Workspace"}</span></span></div>;
}
