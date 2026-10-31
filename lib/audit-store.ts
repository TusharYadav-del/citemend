import "server-only";
import { createServerDatabase } from "./supabase-server";
import type { AuditReport } from "./audit-pipeline";

export class AuditStorageError extends Error {}

export async function persistAudit(report: AuditReport, userId?: string, reservation?: { id: string; createdAt: string }, scheduledId?: string): Promise<{ id: string; createdAt: string }> {
  if (!userId?.trim()) throw new AuditStorageError("An authenticated Clerk user ID is required to save an audit.");
  let db: ReturnType<typeof createServerDatabase>;
  try { db = createServerDatabase(); } catch { throw new AuditStorageError("Configure the server-only Supabase key and project URL."); }
  const { data: audit, error } = reservation
    ? await db.from("audits").update({ status: "free_saving" }).eq("id", reservation.id).eq("user_id", userId).eq("status", "free_pending").eq("created_at", reservation.createdAt).select("id,created_at").single()
    : await db.from("audits").insert({ ...(scheduledId ? { id: scheduledId } : {}), user_id: userId, domain: report.domain, status: "pending" }).select("id,created_at").single();
  if (error || !audit) throw new AuditStorageError("Supabase could not create the audit.");
  const broken = report.findings.filter((item) => item.httpStatus === 404);
  try {
    if (broken.length) {
      const { error: linkError } = await db.from("broken_links").insert(broken.map((item) => ({ audit_id: audit.id, cited_url: item.url, http_status: 404, suggested_redirect: item.suggestedRedirect })));
      if (linkError) throw new Error("Link insert failed.");
    }
    const updateStatus = (includePrompt: boolean) => {
      let query = db.from("audits").update({ status: report.status, ...(includePrompt ? { buyer_prompt: report.buyerPrompt } : {}) }).eq("id", audit.id).eq("user_id", userId);
      if (reservation) query = query.eq("status", "free_saving").eq("created_at", reservation.createdAt);
      return query;
    };
    let { error: statusError } = await updateStatus(true);
    // Existing deployments keep saving audits while migration 005 is pending.
    if (statusError && ["PGRST204", "42703"].includes(statusError.code) && statusError.message.includes("buyer_prompt")) {
      ({ error: statusError } = await updateStatus(false));
    }
    if (statusError) throw new Error("Status update failed.");
    const { data: verified, error: readError } = await db.from("audits").select("id,user_id,status,broken_links(id)").eq("id", audit.id).eq("user_id", userId).single();
    if (readError || !verified || verified.user_id !== userId || verified.status !== report.status || verified.broken_links.length !== broken.length) throw new Error("Read-back failed.");
    return { id: audit.id, createdAt: audit.created_at };
  } catch {
    let cleanup = db.from("audits").delete().eq("id", audit.id).eq("user_id", userId);
    if (reservation) cleanup = cleanup.eq("created_at", reservation.createdAt);
    const { error: cleanupError } = await cleanup;
    if (cleanupError) throw new AuditStorageError(`Audit persistence failed; incomplete audit ${audit.id} may require cleanup.`);
    throw new AuditStorageError("Audit persistence failed; partial rows were removed.");
  }
}
