import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ProgressProps = HTMLAttributes<HTMLDivElement> & { value?: number; max?: number };

export function Progress({ value = 0, max = 100, className, ...props }: ProgressProps) {
  const bounded = Number.isFinite(value) && max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  return <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bounded)} data-slot="progress" className={cn("h-2 w-full overflow-hidden rounded-full bg-[#e1e9dc]", className)} {...props}>
    <div data-slot="progress-indicator" className="h-full rounded-full bg-[#78a35c] transition-[width] duration-700 ease-out" style={{ width: `${bounded}%` }} />
  </div>;
}
