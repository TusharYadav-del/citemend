import type { ReactNode } from "react";

export function DataTable({ children, label }: { children: ReactNode; label: string }) {
  return <div role="region" aria-label={label} tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border border-white/10 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"><table className="w-full border-collapse text-left text-sm">{children}</table></div>;
}
