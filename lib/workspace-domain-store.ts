import "server-only";
import type { createServerDatabase } from "./supabase-server";

type Db = ReturnType<typeof createServerDatabase>;

export async function getWorkspaceDomains(db: Db, ownerUserIds: string[], auditDomains: string[] = []): Promise<string[]> {
  const owners = [...new Set(ownerUserIds.filter(id => id.trim()))];
  if (!owners.length) return [...new Set(auditDomains)];
  const { data, error } = await db.from("workspace_domains").select("domain").in("owner_user_id", owners);
  if (error) {
    // Keep existing installations usable until Migration 046 is applied.
    if (error.code === "42P01" || error.code === "PGRST205") return [...new Set(auditDomains)];
    throw new Error("Could not load connected workspaces.");
  }
  return [...new Set([...auditDomains, ...(data ?? []).map(row => row.domain)])];
}
