import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: string; icon?: ReactNode }) {
  return <Card className="gap-0 border-white/10 bg-[#101722] py-5 text-[#f5f7fa] shadow-[0_24px_72px_-40px_#000]">
    <CardContent className="px-5"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-emerald-300">{label}</p>{icon && <span className="text-emerald-300">{icon}</span>}</div><p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>{detail && <p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p>}</CardContent>
  </Card>;
}
