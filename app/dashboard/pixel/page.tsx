import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerDatabase } from "@/lib/supabase-server";
import PixelDashboard from "@/components/pixel-dashboard";

async function PixelDashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const requestHeaders = await headers();
  const requestHost = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000").split(",")[0].trim();
  const requestProtocol = (requestHeaders.get("x-forwarded-proto") || (process.env.NODE_ENV === "development" ? "http" : "https")).split(",")[0].trim();
  let appOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || `${requestProtocol}://${requestHost}`;
  try { appOrigin = new URL(appOrigin).origin; } catch { appOrigin = "https://citemend.vercel.app"; }

  let initialData = { domain: "", domains: [] as string[], rules: [] as { id: string; source_path: string; target_url: string; confidence: number | null; is_active: boolean; hits_recovered: number; created_at: string }[], events: [] as { id: string; broken_path: string; ai_referrer: string; redirected_to: string | null; created_at: string }[] };
  let initialError = "";
  try {
    const db = createServerDatabase();
    const { data: audits, error: auditError } = await db.from("audits").select("domain,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
    if (auditError) throw auditError;
    const domains = [...new Set((audits ?? []).map(audit => audit.domain))];
    const domain = domains[0] ?? "";
    if (domain) {
      const [rules, events] = await Promise.all([
        db.from("redirect_rules").select("id,source_path,target_url,confidence,is_active,hits_recovered,created_at")
          .eq("user_id", userId).eq("domain", domain).order("created_at", { ascending: false }).limit(200),
        db.from("ai_404_events").select("id,broken_path,ai_referrer,redirected_to,created_at")
          .eq("domain", domain).order("created_at", { ascending: false }).limit(100),
      ]);
      if (rules.error || events.error) throw rules.error ?? events.error;
      initialData = { domain, domains, rules: rules.data ?? [], events: events.data ?? [] };
    } else {
      initialData = { ...initialData, domains };
    }
  } catch {
    initialError = "Pixel activity is temporarily unavailable. Try refreshing the page.";
  }

  return <PixelDashboard initialData={initialData} appOrigin={appOrigin} initialError={initialError} />;
}

export default function PixelPage() {
  return <Suspense fallback={<main className="mx-auto w-full max-w-6xl px-5 py-12 text-sm text-[#68736b]" role="status">Loading pixel dashboard…</main>}><PixelDashboardPage /></Suspense>;
}
