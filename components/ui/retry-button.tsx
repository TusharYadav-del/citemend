"use client";

import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

export function RetryButton({ label = "Retry" }: { label?: string }) {
  const router = useRouter();
  return <button type="button" onClick={() => router.refresh()} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border-strong px-3 text-xs font-semibold text-accent hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-accent"><RotateCw className="size-3.5" />{label}</button>;
}
