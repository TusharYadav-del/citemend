import type { ReactNode } from "react";

const toneClass = { info: "border-cyan-300/20 bg-cyan-300/5 text-cyan-100", success: "border-emerald-300/20 bg-emerald-300/5 text-emerald-100", warning: "border-amber-300/20 bg-amber-300/5 text-amber-100", danger: "border-rose-300/20 bg-rose-300/5 text-rose-100" } as const;
export function AlertBanner({ tone = "info", title, children }: { tone?: keyof typeof toneClass; title?: string; children: ReactNode }) {
  return <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border p-4 text-sm leading-6 ${toneClass[tone]}`}>{title && <p className="font-semibold">{title}</p>}<div className={title ? "mt-1" : undefined}>{children}</div></div>;
}
