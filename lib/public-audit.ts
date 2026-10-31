import "server-only";
import { createServerDatabase } from "./supabase-server";

export async function getPublicAudit(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;

  // UUID links are public; account identifiers and other workspace data stay private.
  const { data, error } = await createServerDatabase()
    .from("audits")
    .select("id,domain,status,created_at,broken_links(id,cited_url,http_status,suggested_redirect)")
    .eq("id", id)
    .in("status", ["completed", "partial", "mock_completed"])
    .maybeSingle();

  if (error) throw new Error("Could not load this audit report.");
  if (!data) return null;
  return { ...data, broken_links: data.broken_links.filter((link) => link.http_status === 404) };
}
