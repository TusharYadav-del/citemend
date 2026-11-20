import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: string; icon?: ReactNode }) {
  return <Card className="gap-0 border-border bg-surface-raised py-5 text-foreground shadow-panel">
    <CardContent className="px-5"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-accent">{label}</p>{icon && <span className="text-accent">{icon}</span>}</div><p className="mt-3 font-mono text-3xl font-semibold tabular-nums tracking-tight">{value}</p>{detail && <p className="mt-2 text-xs leading-5 text-text-secondary">{detail}</p>}</CardContent>
  </Card>;
}
