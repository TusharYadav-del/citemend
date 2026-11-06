import { authenticatePublicApi } from "@/lib/public-api-auth";
export async function GET(request: Request) {
  const auth = await authenticatePublicApi(request, "audit:read"); if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const result = await auth.db.from("audits").select("id,domain,status,created_at,completed_at").eq("user_id", auth.userId).eq("domain", auth.domain).order("created_at", { ascending: false }).limit(100);
  return result.error ? Response.json({ error: "Audit query unavailable." }, { status: 503 }) : Response.json({ data: result.data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
