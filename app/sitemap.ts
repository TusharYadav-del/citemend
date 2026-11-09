import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { createServerDatabase } from "@/lib/supabase-server";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://citemend.vercel.app").replace(/\/$/, "");
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = [
    { url: origin, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...["pricing", "terms", "privacy", "refund-policy"].map(path => ({ url: `${origin}/${path}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
  try {
    const db = createServerDatabase();
    const [prospects, audits] = await Promise.all([
      db.from("outreach_prospects").select("domain,researched_at").eq("report_public", true).not("researched_at", "is", null).order("researched_at", { ascending: false }).limit(5000),
      db.from("audits").select("id,created_at").in("status", ["completed", "partial", "mock_completed"]).order("created_at", { ascending: false }).limit(5000),
    ]);
    return [...fixed,
      ...(prospects.error ? [] : prospects.data ?? []).filter(row => /^[a-z0-9.-]+$/.test(row.domain)).map(row => ({ url: `${origin}/report/${encodeURIComponent(row.domain)}`, lastModified: new Date(row.researched_at ?? now.toISOString()), changeFrequency: "monthly" as const, priority: 0.55 })),
      ...(audits.error ? [] : audits.data ?? []).filter(row => /^[0-9a-f-]{36}$/i.test(row.id)).map(row => ({ url: `${origin}/audit/${row.id}`, lastModified: new Date(row.created_at), changeFrequency: "monthly" as const, priority: 0.5 })),
    ];
  } catch { return fixed; }
}
