"use client";

import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

export function RetryButton({ label = "Retry" }: { label?: string }) {
  const router = useRouter();
  return <button type="button" onClick={() => router.refresh()} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-emerald-200 hover:bg-white/[.05] focus-visible:outline-2 focus-visible:outline-emerald-300"><RotateCw className="size-3.5" />{label}</button>;
}
