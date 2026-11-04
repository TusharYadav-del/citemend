// Read-only schema check: no rows, secrets, or project URL are printed.
const host = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!host || !key) { console.error("Supabase configuration unavailable"); process.exit(2); }
const tables = {
  audits: "id,user_id,domain,buyer_prompt,share_of_model_score,engine_matrix_json,agency_brand_name,agency_logo_url,agency_primary_color,agency_cta_text,agency_cta_url",
  broken_links: "id,audit_id,cited_url,http_status,suggested_redirect",
  subscriptions: "id,user_id,store_id,product_id,variant_id,status,plan,current_period_end",
  weekly_scan_runs: "id,week_start,status,lease_token,digests_prepared_at",
  weekly_scan_jobs: "id,run_id,user_id,domain,buyer_prompt,status,attempts,lease_token,audit_id",
  weekly_scan_digests: "id,run_id,user_id,status,lease_token",
  redirect_rules: "id,user_id,source_host,source_path,destination,active,domain,target_url,is_active,hits_recovered,synced_to_cms",
  sitemap_pages: "id,domain,url,page_title,embedding,embedding_model",
  audit_citation_gaps: "audit_id,user_id,domain,buyer_prompt,provider,competitor_urls",
  ai_404_events: "id,domain,broken_path,ai_referrer,redirected_to",
  cms_connections: "id,user_id,domain,platform,shop_subdomain,access_token",
  citation_hijack_opportunities: "id,audit_id,domain,opportunity_type,target_url,verification_status",
  rescued_ai_visits: "id,domain,broken_path,rescued_target_url,ai_referrer,similarity_score,latency_ms",
  workspace_integrations: "id,user_id,domain,slack_webhook_url,discord_webhook_url,shopify_store_domain,shopify_admin_token,agency_brand_name",
  pixel_intercept_quotas: "domain,window_started_at,request_count",
};
let index = 0;
let failed = false;
const entries = Object.entries(tables);
Promise.all(Array.from({ length: 4 }, async () => {
  while (index < entries.length) {
    const [name, columns] = entries[index++];
    const url = new URL(`/rest/v1/${name}`, host);
    url.searchParams.set("select", columns);
    url.searchParams.set("limit", "0");
    try {
      const response = await fetch(url, { method: "HEAD", headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
      console.log(`${name}: HTTP ${response.status}`);
      if (!response.ok) failed = true;
    } catch { console.log(`${name}: unavailable`); failed = true; }
  }
})).then(() => { if (failed) process.exitCode = 1; });
