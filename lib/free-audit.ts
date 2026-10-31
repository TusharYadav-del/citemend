import "server-only";
import { createHash } from "node:crypto";
import { createServerDatabase } from "./supabase-server";

export type FreeAuditReservation = { kind: "reserved"; id: string; createdAt: string } | { kind: "limit" } | { kind: "busy" };

function reservationId(userId: string): string {
  const hex = createHash("sha256").update("citemend-free-audit:" + userId).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function reserveFreeAudit(userId: string, domain: string): Promise<FreeAuditReservation> {
  const db = createServerDatabase();
  const { count, error: countError } = await db.from("audits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["completed", "partial", "mock_completed"]);
  if (countError || count === null) throw new Error("Audit allowance is temporarily unavailable.");
  if (count > 0) return { kind: "limit" };

  const id = reservationId(userId);
  let createdAt = new Date().toISOString();
  const insert = () => db.from("audits").insert({ id, user_id: userId, domain, status: "free_pending", created_at: createdAt });
  let { error } = await insert();
  if (!error) return { kind: "reserved", id, createdAt };
  if (error.code !== "23505") throw new Error("Audit allowance is temporarily unavailable.");

  const { data: existing, error: readError } = await db.from("audits")
    .select("status,created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error("Audit allowance is temporarily unavailable.");
  if (!existing) return { kind: "busy" };
  if (existing.status === "free_saving") return { kind: "busy" };
  if (existing.status !== "free_pending") return { kind: "limit" };

  // A reservation abandoned by an interrupted server can be retried later.
  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  const existingCreatedAt = Date.parse(existing.created_at);
  if (!Number.isFinite(existingCreatedAt) || existingCreatedAt >= Date.parse(staleBefore)) return { kind: "busy" };
  const { error: deleteError } = await db.from("audits").delete()
    .eq("id", id).eq("user_id", userId).eq("status", "free_pending").lt("created_at", staleBefore);
  if (deleteError) throw new Error("Audit allowance is temporarily unavailable.");
  createdAt = new Date().toISOString();
  ({ error } = await insert());
  if (!error) return { kind: "reserved", id, createdAt };
  if (error.code === "23505") return { kind: "busy" };
  throw new Error("Audit allowance is temporarily unavailable.");
}

export async function releaseFreeAudit(userId: string, id: string, createdAt: string): Promise<void> {
  const db = createServerDatabase();
  const { error } = await db.from("audits").delete()
    .eq("id", id).eq("user_id", userId).eq("status", "free_pending").eq("created_at", createdAt);
  if (error) throw new Error("Could not release the audit reservation.");
}
