import "server-only";
import { createServerDatabase } from "./supabase-server";

export type UserAuditHistoryItem = {
  id: string;
  domain: string;
  status: string;
  created_at: string;
  broken_links: {
    id: string;
    cited_url: string;
    http_status: number;
    suggested_redirect: string | null;
  }[];
};

export async function getUserAuditHistory(userId: string): Promise<UserAuditHistoryItem[]> {
  if (!userId.trim()) throw new Error("A Clerk user ID is required to read audit history.");

  const db = createServerDatabase();
  const { data, error } = await db
    .from("audits")
    .select("id,domain,status,created_at,broken_links(id,cited_url,http_status,suggested_redirect)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Could not load this user's audit history.");
  return data ?? [];
}