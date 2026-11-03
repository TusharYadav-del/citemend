import { createServerDatabase } from "@/lib/supabase-server";

const headers = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(_request: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain: rawDomain } = await params;
  const domain = rawDomain.trim().toLowerCase();
  if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    return new Response("Invalid domain.\n", { status: 400, headers });
  }

  try {
    const db = createServerDatabase();
    const { data, error } = await db.from("audits").select("llms_txt_content")
      .eq("domain", domain).in("status", ["completed", "partial"])
      .not("llms_txt_content", "is", null)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .limit(1).maybeSingle();
    if (error) throw error;
    if (!data?.llms_txt_content) return new Response("No hosted llms.txt is available for this domain.\n", { status: 404, headers });
    return new Response(data.llms_txt_content, { headers });
  } catch {
    return new Response("Hosted llms.txt is temporarily unavailable.\n", { status: 503, headers: { ...headers, "Cache-Control": "no-store" } });
  }
}
