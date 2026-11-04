import "server-only";
import { createServerDatabase } from "./supabase-server";
import { readAgencyProfile } from "./agency-whitelabel";

export async function getPublicAudit(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;

  // UUID links are public; account identifiers and other workspace data stay private.
  const db = createServerDatabase();
  const { data, error } = await db
    .from("audits")
    .select("id,domain,status,created_at,share_of_model_score,engine_matrix_json,agency_brand_name,agency_logo_url,agency_primary_color,agency_cta_text,agency_cta_url,broken_links(id,cited_url,http_status,suggested_redirect)")
    .eq("id", id)
    .in("status", ["completed", "partial", "mock_completed"])
    .maybeSingle();

  if (error) throw new Error("Could not load this audit report.");
  if (!data) return null;
  const agency = readAgencyProfile(data);
  let opportunities: { dead_competitor_url: string | null; target_url: string; competitor_domain: string | null; matched_user_live_url: string | null; http_status: number | null }[] = [];
  let query = db.from("citation_hijack_opportunities").select("opportunity_type,dead_competitor_url,target_url,competitor_domain,matched_user_live_url,http_status").eq("audit_id", id).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (agency) query = query.eq("opportunity_type", "competitor_direct_404");
  const result = await query.limit(agency ? 100 : 2);
  if (!result.error) opportunities = (result.data ?? []).filter(item => item.opportunity_type === "competitor_direct_404");
  return { ...data, agency, opportunities, share_of_model_score: data.share_of_model_score ?? 0, broken_links: data.broken_links.filter((link) => link.http_status === 404) };
}
