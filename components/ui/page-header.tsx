import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-6"><div>{eyebrow && <p className="mb-3 text-[10px] font-bold uppercase tracking-[.18em] text-emerald-400">{eyebrow}</p>}<h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>}</div>{actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}</header>;
}
