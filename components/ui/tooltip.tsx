import type { ReactNode } from "react";

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="group/tooltip relative inline-flex"><span tabIndex={0} aria-label={label} className="inline-flex">{children}</span><span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-56 -translate-x-1/2 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-foreground opacity-0 shadow-panel transition-opacity group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100">{label}</span></span>;
}
