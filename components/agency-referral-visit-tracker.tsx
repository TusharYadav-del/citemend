"use client";

import { useEffect } from "react";
import { normalizeAgencyReferralCode } from "@/lib/referral-code";

export function AgencyReferralVisitTracker({ code }: { code?: string }) {
  useEffect(() => {
    const referral = normalizeAgencyReferralCode(code);
    if (!referral) return;
    void fetch(`/api/agency-referrals/track?ref=${encodeURIComponent(referral)}`, { method: "POST", credentials: "same-origin", keepalive: true });
  }, [code]);
  return null;
}
