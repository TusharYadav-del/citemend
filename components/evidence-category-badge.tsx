import { EVIDENCE_CATEGORY_LABELS, type EvidenceCategory } from "@/lib/evidence-categories";

export function EvidenceCategoryBadge({ category, className = "" }: { category: EvidenceCategory; className?: string }) {
  const colors = category === "http" ? "border-emerald-300/25 bg-emerald-300/[.06] text-emerald-100" : category === "observation" ? "border-cyan-300/25 bg-cyan-300/[.06] text-cyan-100" : "border-amber-300/25 bg-amber-300/[.06] text-amber-100";
  return <span title={EVIDENCE_CATEGORY_LABELS[category]} className={`inline-flex max-w-full rounded-full border px-2 py-1 text-[9px] leading-4 ${colors} ${className}`}>{EVIDENCE_CATEGORY_LABELS[category]}</span>;
}
