import "server-only";
import { createServerDatabase } from "./supabase-server";
import { readAgencyProfile } from "./agency-whitelabel";
import { buildBeforeAfterReport, type RecoverySnapshot } from "./before-after-report";
import { failedDestinationKey } from "./link-health";

export async function getPublicAudit(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;

  // UUID links are public; account identifiers and other workspace data stay private.
  const db = createServerDatabase();
  const { data, error } = await db
    .from("audits")
    .select("id,domain,status,created_at,share_of_model_score,engine_matrix_json,agency_brand_name,agency_logo_url,agency_primary_color,agency_cta_text,agency_cta_url,broken_links(id,cited_url,http_status,suggested_redirect,approval_status,link_health_json,wayback_snapshot_json)")
    .eq("id", id)
    .in("status", ["completed", "partial", "mock_completed"])
    .maybeSingle();

  if (error) throw new Error("Could not load this audit report.");
  if (!data) return null;
  const agency = readAgencyProfile(data);
  let allOpportunities: { opportunity_type: string; dead_competitor_url: string | null; target_url: string; competitor_domain: string | null; matched_user_live_url: string | null; http_status: number | null; source_page_url?: string | null; failed_destination_url_key?: string | null; replacement_snippet?: string | null; wayback_snapshot_json?: { url?: string; capturedAt?: string; originalStatus?: number } | null }[] = [];
  let query = db.from("citation_hijack_opportunities").select("opportunity_type,dead_competitor_url,target_url,competitor_domain,matched_user_live_url,http_status,source_page_url,failed_destination_url_key,replacement_snippet,wayback_snapshot_json").eq("audit_id", id).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (agency) query = query.eq("opportunity_type", "competitor_direct_404");
  const result = await query.limit(1000);
  if (!result.error) allOpportunities = (result.data ?? []).filter(item => item.opportunity_type === "competitor_direct_404" || item.opportunity_type === "listicle_outbound_404");
  const opportunities = allOpportunities.slice(0, agency ? 100 : 2);
  const pageLevelBrokenLinkCount = new Set(allOpportunities.filter(item => item.opportunity_type === "listicle_outbound_404" && item.source_page_url && item.dead_competitor_url)
    .map(item => `${failedDestinationKey(item.source_page_url!) ?? item.source_page_url}|${item.failed_destination_url_key ?? failedDestinationKey(item.dead_competitor_url!) ?? item.dead_competitor_url}`)).size;
  const uniqueFailedDestinationCount = new Set([
    ...data.broken_links.filter(link => link.http_status === 404 || link.http_status === 410).map(link => failedDestinationKey(link.cited_url)),
    ...allOpportunities.filter(item => item.http_status === 404 || item.http_status === 410).map(item => item.failed_destination_url_key ?? failedDestinationKey(item.dead_competitor_url ?? "")),
  ].filter((value): value is string => !!value)).size;
  let beforeAfterReports: { destination: string; technicalDeploymentVerified: boolean; subsequentCitationObserved: boolean; diff: ReturnType<typeof buildBeforeAfterReport> | null }[] = [];
  try {
    const [outcomes, evidence] = await Promise.all([
      db.from("recovery_outcomes").select("broken_link_id,canonical_destination_url,technical_deployment_verified_at,ai_citation_observed_at,created_at").eq("audit_id", id).order("created_at", { ascending: true }).limit(100),
      db.from("ai_observation_evidence").select("prompt_query,extracted_urls_json,observed_at").eq("audit_id", id).order("observed_at", { ascending: true }).limit(500),
    ]);
    const outcomeRows = !outcomes.error && Array.isArray(outcomes.data) ? outcomes.data : [];
    const evidenceRows = !evidence.error && Array.isArray(evidence.data) ? evidence.data : [];
    beforeAfterReports = outcomeRows.map(outcome => {
      const technicalAt = outcome.technical_deployment_verified_at;
      if (!technicalAt) return { destination: outcome.canonical_destination_url, technicalDeploymentVerified: false, subsequentCitationObserved: false, diff: null };
      const source = data.broken_links.find(link => link.id === outcome.broken_link_id);
      const beforeRecord = evidenceRows.filter(item => Date.parse(item.observed_at) < Date.parse(technicalAt)).find(item => source && item.extracted_urls_json.includes(source.cited_url)) ?? evidenceRows.find(item => Date.parse(item.observed_at) < Date.parse(technicalAt));
      const afterRecord = evidenceRows.filter(item => Date.parse(item.observed_at) > Date.parse(technicalAt)).at(-1);
      const before: RecoverySnapshot | null = beforeRecord ? { observedAt: beforeRecord.observed_at, brokenUrl: source?.cited_url ?? null, citedUrls: beforeRecord.extracted_urls_json, urlState: source ? "404" : "unknown" } : null;
      const after: RecoverySnapshot | null = afterRecord ? { observedAt: afterRecord.observed_at, citedUrls: afterRecord.extracted_urls_json, urlState: "200", canonicalUrl: outcome.canonical_destination_url } : null;
      return { destination: outcome.canonical_destination_url, technicalDeploymentVerified: true, subsequentCitationObserved: !!after?.citedUrls.includes(outcome.canonical_destination_url), diff: before && after ? buildBeforeAfterReport(before, after) : null };
    });
  } catch { /* Older hosted projects can render the saved snapshot while additive migrations are pending. */ }
  return { ...data, agency, opportunities, linkCounts: { pageLevelBrokenLinkCount, uniqueFailedDestinationCount }, beforeAfterReports, broken_links: data.broken_links.filter((link) => link.http_status === 404 || link.http_status === 410) };
}
