import type { ReactNode } from "react";

export function CodeBlock({ children, label }: { children: ReactNode; label?: string }) {
  return <figure className="overflow-hidden rounded-xl border border-white/10 bg-[#0b1017]">{label && <figcaption className="border-b border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</figcaption>}<pre tabIndex={0} className="max-w-full overflow-x-auto p-4 text-xs leading-6 text-emerald-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"><code>{children}</code></pre></figure>;
}
