import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="mb-7 flex flex-col items-start justify-between gap-4 border-b border-border pb-5 sm:mb-8 sm:gap-5 sm:pb-6 lg:flex-row lg:items-end"><div className="min-w-0">{eyebrow && <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[.12em] text-accent">{eyebrow}</p>}<h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>{actions && <div className="flex w-full flex-wrap items-center gap-2.5 lg:w-auto">{actions}</div>}</header>;
}
