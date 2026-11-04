import "server-only";
import { createServerDatabase } from "./supabase-server";

export type UserAuditHistoryItem = {
  id: string;
  domain: string;
  status: string;
  created_at: string;
  share_of_model_score: number | null;
  engine_matrix_json: unknown;
  broken_links: {
    id: string;
    cited_url: string;
    http_status: number;
    suggested_redirect: string | null;
    url_state: string;
    approval_status: string;
    match_confidence: number | null;
    match_evidence_reason: string | null;
  }[];
};

export async function getUserAuditHistory(userId: string): Promise<UserAuditHistoryItem[]> {
  if (!userId.trim()) throw new Error("A Clerk user ID is required to read audit history.");

  const db = createServerDatabase();
  const { data, error } = await db
    .from("audits")
    .select("id,domain,status,created_at,share_of_model_score,engine_matrix_json,broken_links(id,cited_url,http_status,suggested_redirect,url_state,approval_status,match_confidence,match_evidence_reason)")
    .eq("user_id", userId)
    .not("status", "in", "(free_pending,free_saving)")
    .order("created_at", { ascending: false });

  if (error) throw new Error("Could not load this user's audit history.");
  return data ?? [];
}
