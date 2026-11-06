"use client";

import { useEffect } from "react";

export function AgencyReferralConversionTracker({ domain }: { domain: string }) {
  useEffect(() => {
    if (!domain) return;
    void fetch("/api/agency-referrals/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
      credentials: "same-origin",
    });
  }, [domain]);
  return null;
}
