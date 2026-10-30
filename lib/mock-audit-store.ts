import "server-only";
import { createServerDatabase } from "./supabase-server";
import type { MockAudit } from "./mock-audit";

export type SavedMockAudit = {
  id: string;
  domain: string;
  status: string;
  created_at: string;
  broken_links: { id: string; cited_url: string; http_status: number; suggested_redirect: string | null }[];
};

export async function saveMockAudit(report: MockAudit): Promise<SavedMockAudit> {
  // Both the action and data layer enforce the local-only setup boundary.
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Mock audit persistence is available only in development.");
  }
  const db = createServerDatabase();
  const { data: audit, error: auditError } = await db.from("audits")
    .insert({ domain: report.domain, status: "mock_pending" }).select("id").single();
  if (auditError || !audit) throw new Error("Supabase could not create the mock audit. Check the server key, table grants, and migration.");

  try {
    const { error: linksError } = await db.from("broken_links").insert(report.brokenLinks.map((link) => ({
      audit_id: audit.id,
      cited_url: link.citedUrl,
      http_status: link.httpStatus,
      suggested_redirect: link.suggestedRedirect,
    })));
    if (linksError) throw new Error("Could not save the mock broken-link rows.");
    const { error: statusError } = await db.from("audits").update({ status: "mock_completed" }).eq("id", audit.id);
    if (statusError) throw new Error("Could not finalize the mock audit.");
    const { data: saved, error: readError } = await db.from("audits")
      .select("id,domain,status,created_at,broken_links(id,cited_url,http_status,suggested_redirect)")
      .eq("id", audit.id).single<SavedMockAudit>();
    if (readError || !saved || saved.broken_links.length !== report.brokenLinks.length) {
      throw new Error("Could not verify the saved audit and broken-link relationship.");
    }
    return saved;
  } catch {
    // Compensate for a partial multi-request save; cascade removes its child rows.
    const { error: cleanupError } = await db.from("audits").delete().eq("id", audit.id);
    if (cleanupError) throw new Error(`Save failed and cleanup could not be confirmed. Inspect mock audit ${audit.id} in Supabase before retrying.`);
    throw new Error("The mock audit could not be saved and verified. Its partial rows were removed; check Supabase and retry.");
  }
}
