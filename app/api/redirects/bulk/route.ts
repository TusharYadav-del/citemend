import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { readRequestJson } from "@/lib/read-request-json";
import { exportRedirectRecords, parseRedirectImport } from "@/lib/integrations-workflow";
import { verifyUrl } from "@/lib/seo";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  const { userId } = await auth(); if (!userId) return json({ error: "Sign in to import or export recovery URLs." }, 401);
  const parsed = await readRequestJson(request, 1_100_000); if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object") return json({ error: "Provide valid bulk import/export settings." }, 400);
  const input = parsed.value as Record<string, unknown>; if (typeof input.domain !== "string" || (input.format !== "csv" && input.format !== "json") || (input.action !== "import" && input.action !== "export")) return json({ error: "Provide domain, format (CSV or JSON), and action." }, 400);
  let domain: string; try { domain = normalizeDashboardDomain(input.domain); } catch { return json({ error: "Provide a valid domain." }, 400); }
  const db = createServerDatabase(); try {
    let auditQuery = db.from("audits").select("id").eq("user_id", userId).eq("domain", domain).order("created_at", { ascending: false }).limit(100);
    if (typeof input.auditId === "string") auditQuery = auditQuery.eq("id", input.auditId);
    const audits = await auditQuery; if (audits.error) throw audits.error; if (!audits.data?.length) return json({ error: "No owned audit was found for this domain." }, 404);
    if (input.action === "export") {
      const links = await db.from("broken_links").select("cited_url,suggested_redirect,url_state,approval_status").in("audit_id", audits.data.map(item => item.id)).order("created_at", { ascending: false }).limit(5000);
      if (links.error) throw links.error;
      const records = (links.data ?? []).map(item => ({ broken_url: item.cited_url, destination_url: item.suggested_redirect ?? "", url_state: item.url_state, approval_status: item.approval_status }));
      const content = exportRedirectRecords(records, input.format);
      const logged = await db.from("action_audit_logs").insert({ workspace_domain: domain, actor_user_id: userId, action_type: "data_export", target_url: null, previous_state_json: null, new_state_json: { format: input.format, rows: records.length }, safety_check_passed: true });
      if (logged.error) throw logged.error;
      return json({ content, count: records.length });
    }
    if (typeof input.content !== "string") return json({ error: "Provide CSV or JSON content to import." }, 400);
    const rows = parseRedirectImport(input.content, input.format);
    if (rows.length > 100) return json({ error: "Bulk import is limited to 100 mappings per request so every URL can be safely revalidated." }, 413);
    const approvedAuditIds = audits.data.map(item => item.id); const saved: string[] = [];
    for (const row of rows) {
      const source = new URL(row.broken_url), destination = new URL(row.destination_url);
      if (![domain, `www.${domain}`].includes(source.hostname) || ![domain, `www.${domain}`].includes(destination.hostname)) return json({ error: "Imported source and destination must belong to the selected workspace domain." }, 422);
      if (source.href === destination.href) return json({ error: "A redirect cannot point to itself." }, 422);
      const [sourceCheck, destinationCheck] = await Promise.all([verifyUrl(source.href), verifyUrl(destination.href)]);
      if (sourceCheck.state !== "404" || sourceCheck.httpStatus !== 404 || destinationCheck.state !== "200" || destinationCheck.httpStatus !== 200) return json({ error: "Each imported mapping must have a current HTTP 404 source and HTTP 200 destination." }, 422);
      const result = await db.from("broken_links").insert({ audit_id: approvedAuditIds[0], cited_url: source.href, http_status: 404, url_state: "404", suggested_redirect: destination.href, approval_status: "pending_review", match_confidence: null, match_evidence_reason: "Imported mapping; owner approval and redirect preview are required." }).select("id").single();
      if (result.error || !result.data) throw result.error ?? new Error("Import failed."); saved.push(result.data.id);
    }
    return json({ imported: saved.length, status: "pending_review", ids: saved }, 201);
  } catch { return json({ error: "Bulk import/export is temporarily unavailable." }, 503); }
}
