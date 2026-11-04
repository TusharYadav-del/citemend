import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <section className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center"><h2 className="text-base font-semibold text-white">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">{description}</p>{action && <div className="mt-5">{action}</div>}</section>;
}
