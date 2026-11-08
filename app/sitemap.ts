import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { createServerDatabase } from "@/lib/supabase-server";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://citemend.com").replace(/\/$/, "");
  try {
    const db = createServerDatabase();
    const { data, error } = await db.from("outreach_prospects").select("domain,researched_at").eq("report_public", true).not("researched_at", "is", null).order("researched_at", { ascending: false }).limit(5000);
    if (error) throw error;
    return (data ?? []).filter(row => /^[a-z0-9.-]+$/.test(row.domain)).map(row => ({ url: `${origin}/report/${encodeURIComponent(row.domain)}`, lastModified: new Date(row.researched_at ?? new Date().toISOString()), changeFrequency: "monthly" as const, priority: 0.55 }));
  } catch { return []; }
}
