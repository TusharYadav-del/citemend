import "server-only";
import { createServerDatabase } from "./supabase-server";
import type { AuditReport } from "./audit-pipeline";

export class AuditStorageError extends Error {}

export async function persistAudit(report: AuditReport): Promise<{ id: string; createdAt: string }> {
  let db: ReturnType<typeof createServerDatabase>;
  try { db = createServerDatabase(); } catch { throw new AuditStorageError("Configure the server-only Supabase key and project URL."); }
  const { data: audit, error } = await db.from("audits").insert({ domain: report.domain, status: "pending" }).select("id,created_at").single();
  if (error || !audit) throw new AuditStorageError("Supabase could not create the audit.");
  const broken = report.findings.filter((item) => item.httpStatus === 404);
  try {
    if (broken.length) {
      const { error: linkError } = await db.from("broken_links").insert(broken.map((item) => ({ audit_id: audit.id, cited_url: item.url, http_status: 404, suggested_redirect: item.suggestedRedirect })));
      if (linkError) throw new Error("Link insert failed.");
    }
    const { error: statusError } = await db.from("audits").update({ status: report.status }).eq("id", audit.id);
    if (statusError) throw new Error("Status update failed.");
    const { data: verified, error: readError } = await db.from("audits").select("id,status,broken_links(id)").eq("id", audit.id).single();
    if (readError || !verified || verified.status !== report.status || verified.broken_links.length !== broken.length) throw new Error("Read-back failed.");
    return { id: audit.id, createdAt: audit.created_at };
  } catch {
    const { error: cleanupError } = await db.from("audits").delete().eq("id", audit.id);
    if (cleanupError) throw new AuditStorageError(`Audit persistence failed; incomplete audit ${audit.id} may require cleanup.`);
    throw new AuditStorageError("Audit persistence failed; partial rows were removed.");
  }
}
