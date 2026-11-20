import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <section className="rounded-lg border border-dashed border-border-strong bg-surface px-5 py-10 text-center sm:px-6 sm:py-12"><h2 className="text-base font-semibold text-foreground">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">{description}</p>{action && <div className="mt-5 flex justify-center">{action}</div>}</section>;
}
