"use client";

import { useState } from "react";
import { toast } from "sonner";
import UpgradeModal from "@/components/upgrade-modal";

export default function PublishRedirect({ linkId, initiallyActive, isPro }: { linkId: string; initiallyActive: boolean; isPro: boolean | null }) {
  const [active, setActive] = useState(initiallyActive);
  const [pending, setPending] = useState(false);
  const [upgrade, setUpgrade] = useState(false);

  async function changeRule() {
    if (!active && !isPro) { setUpgrade(true); return; }
    setPending(true);
    try {
      const response = await fetch("/api/redirect-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, active: !active }),
      });
      const result: { error?: string; code?: string } = await response.json();
      if (response.status === 403 && result.code === "PRO_REQUIRED") { setUpgrade(true); return; }
      if (!response.ok) throw new Error(result.error || "Could not update this redirect.");
      setActive(!active);
      toast.success(active ? "Redirect disabled." : "Redirect published to the edge lookup.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this redirect.");
    } finally { setPending(false); }
  }

  return <>
    <button type="button" onClick={changeRule} disabled={pending} className="mt-3 min-h-10 rounded-lg border border-[#dbe3d2] bg-white px-3 py-2 text-xs font-semibold text-[#214d39] hover:bg-[#f0f5e9] disabled:opacity-60">
      {pending ? "Saving..." : active ? "Disable edge redirect" : "Publish edge redirect"}
    </button>
    {upgrade && <UpgradeModal onClose={() => setUpgrade(false)} />}
  </>;
}
