import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, description, align = "left" }: { eyebrow: string; title: string; description?: ReactNode; align?: "left" | "center" }) {
  return <div className={`${align === "center" ? "mx-auto text-center" : ""} max-w-2xl`}><p className="cm-kicker">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.045em] text-foreground sm:text-4xl">{title}</h2>{description && <p className="mt-4 text-base leading-7 text-text-secondary">{description}</p>}</div>;
}
