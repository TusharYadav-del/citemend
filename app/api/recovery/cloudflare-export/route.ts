import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { cloudflareRows, formatCloudflareRedirects } from "@/lib/recovery/verify";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to export redirects." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const query = new URL(request.url).searchParams;
  let domain: string;
  try { domain = normalizeDashboardDomain(query.get("domain") ?? ""); } catch { return Response.json({ error: "Provide a valid domain." }, { status: 400 }); }
  const format = query.get("format");
  if (format !== "csv" && format !== "json") return Response.json({ error: "Select csv or json format." }, { status: 400 });
  try {
    const db = createServerDatabase();
    const audits = await db.from("audits").select("id").eq("user_id", userId).eq("domain", domain).limit(500);
    if (audits.error) throw audits.error;
    const ids = (audits.data ?? []).map(row => row.id);
    if (!ids.length) return Response.json({ error: "This domain is not associated with your account." }, { status: 404 });
    const result = await db.from("recovery_findings").select("dead_url:normalized_path,suggested_target_url,approval_status,guardrail_classification,finding_type").in("audit_id", ids).eq("domain", domain).eq("finding_type", "dead_url").eq("guardrail_classification", "recoverable_equivalent").in("approval_status", ["approved", "deployed"]).not("suggested_target_url", "is", null).limit(1000);
    if (result.error) throw result.error;
    const rows = cloudflareRows(domain, (result.data ?? []).map(row => ({ ...row, dead_url: `https://${domain}${String(row.dead_url).startsWith("/") ? row.dead_url : `/${row.dead_url}`}` })));
    if (!rows.length) return Response.json({ error: "No human-approved recovery findings are available for export." }, { status: 422 });
    const body = formatCloudflareRedirects(rows, format);
    const filename = `citemend-cloudflare-redirects.${format}`;
    return new Response(body, { headers: { "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Cloudflare redirect export is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
