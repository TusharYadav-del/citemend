export type Database = {
  public: {
    Tables: {
      ai_observation_evidence: {
        Row: { id: string; audit_id: string; domain: string; prompt_query: string; prompt_version: string; provider: string; model_name: string; search_method: string; locale: string; raw_answer: string; extracted_urls_json: string[]; sample_size: number; observation_confidence: number | null; job_status: string; retry_count: number; error_message: string | null; observed_at: string };
        Insert: { id?: string; audit_id: string; domain: string; prompt_query: string; prompt_version?: string; provider: string; model_name: string; search_method: string; locale?: string; raw_answer: string; extracted_urls_json?: string[]; sample_size?: number; observation_confidence?: number | null; job_status?: string; retry_count?: number; error_message?: string | null; observed_at?: string };
        Update: { id?: string; audit_id?: string; domain?: string; prompt_query?: string; prompt_version?: string; provider?: string; model_name?: string; search_method?: string; locale?: string; raw_answer?: string; extracted_urls_json?: string[]; sample_size?: number; observation_confidence?: number | null; job_status?: string; retry_count?: number; error_message?: string | null; observed_at?: string };
        Relationships: [];
      };
      recovery_outcomes: {
        Row: { id: string; audit_id: string; domain: string; broken_link_id: string | null; canonical_destination_url: string; technical_deployment_verified_at: string | null; ai_citation_observed_at: string | null; evidence_id: string | null; created_at: string };
        Insert: { id?: string; audit_id: string; domain: string; broken_link_id?: string | null; canonical_destination_url: string; technical_deployment_verified_at?: string | null; ai_citation_observed_at?: string | null; evidence_id?: string | null; created_at?: string };
        Update: { id?: string; audit_id?: string; domain?: string; broken_link_id?: string | null; canonical_destination_url?: string; technical_deployment_verified_at?: string | null; ai_citation_observed_at?: string | null; evidence_id?: string | null; created_at?: string };
        Relationships: [];
      };
      webhook_events_log: {
        Row: { id: string; event_id: string; provider: string; event_type: string; delivery_status: string; retry_count: number; last_error: string | null; received_at: string; completed_at: string | null };
        Insert: { id?: string; event_id: string; provider: string; event_type: string; delivery_status?: string; retry_count?: number; last_error?: string | null; received_at?: string; completed_at?: string | null };
        Update: { id?: string; event_id?: string; provider?: string; event_type?: string; delivery_status?: string; retry_count?: number; last_error?: string | null; received_at?: string; completed_at?: string | null };
        Relationships: [];
      };
      workspace_api_keys: {
        Row: { id: string; user_id: string; workspace_domain: string; key_hash: string; key_prefix: string; permissions_json: string[]; rate_limit_per_minute: number; last_used_at: string | null; created_at: string; revoked_at: string | null };
        Insert: { id?: string; user_id: string; workspace_domain: string; key_hash: string; key_prefix: string; permissions_json?: string[]; rate_limit_per_minute?: number; last_used_at?: string | null; created_at?: string; revoked_at?: string | null };
        Update: { id?: string; user_id?: string; workspace_domain?: string; key_hash?: string; key_prefix?: string; permissions_json?: string[]; rate_limit_per_minute?: number; last_used_at?: string | null; created_at?: string; revoked_at?: string | null };
        Relationships: [];
      };
      autonomous_agent_runs: {
        Row: { id: string; user_id: string; workspace_domain: string; audit_id: string; opportunity_id: string | null; broken_link_id: string | null; action_type: string; risk_level: string; current_step: string; run_status: string; human_approved_by: string | null; human_approved_at: string | null; evidence_json: Record<string, unknown>; recommendation_json: Record<string, unknown>; result_json: Record<string, unknown>; stage_history_json: unknown[]; rollback_snapshot_json: unknown | null; rollback_completed_at: string | null; error_message: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; workspace_domain: string; audit_id: string; opportunity_id?: string | null; broken_link_id?: string | null; action_type: string; risk_level: string; current_step?: string; run_status?: string; human_approved_by?: string | null; human_approved_at?: string | null; evidence_json?: Record<string, unknown>; recommendation_json?: Record<string, unknown>; result_json?: Record<string, unknown>; stage_history_json?: unknown[]; rollback_snapshot_json?: unknown | null; rollback_completed_at?: string | null; error_message?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; workspace_domain?: string; audit_id?: string; opportunity_id?: string | null; broken_link_id?: string | null; action_type?: string; risk_level?: string; current_step?: string; run_status?: string; human_approved_by?: string | null; human_approved_at?: string | null; evidence_json?: Record<string, unknown>; recommendation_json?: Record<string, unknown>; result_json?: Record<string, unknown>; stage_history_json?: unknown[]; rollback_snapshot_json?: unknown | null; rollback_completed_at?: string | null; error_message?: string | null; updated_at?: string };
        Relationships: [];
      };
      ecommerce_catalog_items: {
        Row: { id: string; user_id: string; workspace_domain: string; platform: string; external_item_id: string; canonical_url: string | null; product_json: Record<string, unknown>; synced_at: string };
        Insert: { id?: string; user_id: string; workspace_domain: string; platform: string; external_item_id: string; canonical_url?: string | null; product_json?: Record<string, unknown>; synced_at?: string };
        Update: { id?: string; user_id?: string; workspace_domain?: string; platform?: string; external_item_id?: string; canonical_url?: string | null; product_json?: Record<string, unknown>; synced_at?: string };
        Relationships: [];
      };
      organization_members: {
        Row: { id: string; organization_id: string; owner_user_id: string; member_user_id: string; role: string; created_at: string };
        Insert: { id?: string; organization_id: string; owner_user_id: string; member_user_id: string; role?: string; created_at?: string };
        Update: { id?: string; organization_id?: string; owner_user_id?: string; member_user_id?: string; role?: string; created_at?: string };
        Relationships: [];
      };
      workspace_governance_policies: {
        Row: { id: string; user_id: string; workspace_domain: string; monthly_scan_quota: number; scans_used_this_month: number; usage_month: string; entity_truth_baseline_json: Record<string, unknown>; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; workspace_domain: string; monthly_scan_quota?: number; scans_used_this_month?: number; usage_month?: string; entity_truth_baseline_json?: Record<string, unknown>; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; workspace_domain?: string; monthly_scan_quota?: number; scans_used_this_month?: number; usage_month?: string; entity_truth_baseline_json?: Record<string, unknown>; updated_at?: string };
        Relationships: [];
      };
      scheduled_reports: {
        Row: { id: string; user_id: string; workspace_domain: string; report_type: string; schedule_at: string; status: string; payload_json: Record<string, unknown>; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; workspace_domain: string; report_type?: string; schedule_at: string; status?: string; payload_json?: Record<string, unknown>; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; workspace_domain?: string; report_type?: string; schedule_at?: string; status?: string; payload_json?: Record<string, unknown>; updated_at?: string };
        Relationships: [];
      };
      citation_change_events: {
        Row: { id: string; user_id: string; workspace_domain: string; audit_id: string | null; previous_observation_id: string | null; current_observation_id: string | null; prompt_query: string; event_type: string; source_url: string; replacement_url: string | null; evidence_json: Record<string, unknown>; detected_at: string };
        Insert: { id?: string; user_id: string; workspace_domain: string; audit_id?: string | null; previous_observation_id?: string | null; current_observation_id?: string | null; prompt_query: string; event_type: string; source_url: string; replacement_url?: string | null; evidence_json?: Record<string, unknown>; detected_at?: string };
        Update: { id?: string; user_id?: string; workspace_domain?: string; audit_id?: string | null; previous_observation_id?: string | null; current_observation_id?: string | null; prompt_query?: string; event_type?: string; source_url?: string; replacement_url?: string | null; evidence_json?: Record<string, unknown>; detected_at?: string };
        Relationships: [];
      };
      action_audit_logs: {
        Row: { id: string; workspace_domain: string; actor_user_id: string; action_type: string; target_url: string | null; previous_state_json: unknown; new_state_json: unknown; safety_check_passed: boolean; created_at: string };
        Insert: { id?: string; workspace_domain: string; actor_user_id: string; action_type: string; target_url?: string | null; previous_state_json?: unknown; new_state_json?: unknown; safety_check_passed: boolean; created_at?: string };
        Update: { id?: string; workspace_domain?: string; actor_user_id?: string; action_type?: string; target_url?: string | null; previous_state_json?: unknown; new_state_json?: unknown; safety_check_passed?: boolean; created_at?: string };
        Relationships: [];
      };
      pixel_intercept_quotas: {
        Row: { domain: string; window_started_at: string; request_count: number };
        Insert: { domain: string; window_started_at?: string; request_count?: number };
        Update: { domain?: string; window_started_at?: string; request_count?: number };
        Relationships: [];
      };
      workspace_integrations: {
        Row: { id: string; user_id: string; domain: string; slack_webhook_url: string | null; discord_webhook_url: string | null; shopify_store_domain: string | null; shopify_admin_token: string | null; vercel_project_id: string | null; agency_brand_name: string | null; agency_logo_url: string | null; agency_primary_color: string | null; agency_cta_text: string | null; agency_cta_url: string | null; updated_at: string | null };
        Insert: { id?: string; user_id: string; domain: string; slack_webhook_url?: string | null; discord_webhook_url?: string | null; shopify_store_domain?: string | null; shopify_admin_token?: string | null; vercel_project_id?: string | null; agency_brand_name?: string | null; agency_logo_url?: string | null; agency_primary_color?: string | null; agency_cta_text?: string | null; agency_cta_url?: string | null; updated_at?: string | null };
        Update: { id?: string; user_id?: string; domain?: string; slack_webhook_url?: string | null; discord_webhook_url?: string | null; shopify_store_domain?: string | null; shopify_admin_token?: string | null; vercel_project_id?: string | null; agency_brand_name?: string | null; agency_logo_url?: string | null; agency_primary_color?: string | null; agency_cta_text?: string | null; agency_cta_url?: string | null; updated_at?: string | null };
        Relationships: [];
      };
      rescued_ai_visits: {
        Row: { id: string; domain: string; broken_path: string; rescued_target_url: string; ai_referrer: string; similarity_score: number | null; latency_ms: number | null; user_agent: string | null; created_at: string | null };
        Insert: { id?: string; domain: string; broken_path: string; rescued_target_url: string; ai_referrer: string; similarity_score?: number | null; latency_ms?: number | null; user_agent?: string | null; created_at?: string | null };
        Update: { id?: string; domain?: string; broken_path?: string; rescued_target_url?: string; ai_referrer?: string; similarity_score?: number | null; latency_ms?: number | null; user_agent?: string | null; created_at?: string | null };
        Relationships: [];
      };
      audit_citation_gaps: {
        Row: { audit_id: string; user_id: string; domain: string; buyer_prompt: string; provider: string; competitor_urls: string[]; created_at: string };
        Insert: { audit_id: string; user_id: string; domain: string; buyer_prompt: string; provider: string; competitor_urls: string[]; created_at?: string };
        Update: { audit_id?: string; user_id?: string; domain?: string; buyer_prompt?: string; provider?: string; competitor_urls?: string[]; created_at?: string };
        Relationships: [];
      };
      sitemap_pages: {
        Row: { id: string; domain: string; url: string; page_title: string; embedding: string; embedding_model: string; updated_at: string };
        Insert: { id?: string; domain: string; url: string; page_title: string; embedding: string; embedding_model?: string; updated_at?: string };
        Update: { id?: string; domain?: string; url?: string; page_title?: string; embedding?: string; embedding_model?: string; updated_at?: string };
        Relationships: [];
      };
      audits: {
        Row: { id: string; user_id: string | null; domain: string; buyer_prompt: string | null; webhook_url: string | null; llms_txt_content: string | null; competitor_domains: string[]; ground_truth_pricing: string | null; indexnow_key: string | null; share_of_model_score: number | null; engine_matrix_json: unknown; agency_brand_name: string | null; agency_logo_url: string | null; agency_primary_color: string | null; agency_cta_url: string | null; agency_cta_text: string | null; sitemap_url_count: number; status: string; created_at: string };
        Insert: { id?: string; user_id?: string | null; domain: string; buyer_prompt?: string | null; webhook_url?: string | null; llms_txt_content?: string | null; competitor_domains?: string[]; ground_truth_pricing?: string | null; indexnow_key?: string | null; share_of_model_score?: number | null; engine_matrix_json?: unknown; agency_brand_name?: string | null; agency_logo_url?: string | null; agency_primary_color?: string | null; agency_cta_url?: string | null; agency_cta_text?: string | null; sitemap_url_count?: number; status?: string; created_at?: string };
        Update: { id?: string; user_id?: string | null; domain?: string; buyer_prompt?: string | null; webhook_url?: string | null; llms_txt_content?: string | null; competitor_domains?: string[]; ground_truth_pricing?: string | null; indexnow_key?: string | null; share_of_model_score?: number | null; engine_matrix_json?: unknown; agency_brand_name?: string | null; agency_logo_url?: string | null; agency_primary_color?: string | null; agency_cta_url?: string | null; agency_cta_text?: string | null; sitemap_url_count?: number; status?: string; created_at?: string };
        Relationships: [];
      };
      citation_hijack_opportunities: {
        Row: { id: string; audit_id: string | null; domain: string; opportunity_type: string; prompt_query: string; cited_engine: string; target_url: string; dead_competitor_url: string | null; competitor_domain: string | null; http_status: number | null; matched_user_live_url: string | null; similarity_score: number | null; brand_mentioned: boolean | null; contact_email_or_link: string | null; outreach_draft: string | null; corrective_schema_json: string | null; verification_status: string | null; lifecycle_stage: string; relevance_score: number; buyer_intent_score: number; citation_evidence_score: number; replacement_quality_score: number; composite_priority_score: number; stage_history_json: Array<{ stage: string; at: string; actor_user_id: string; note: string }>; last_checked_at: string | null; created_at: string | null };
        Insert: { id?: string; audit_id?: string | null; domain: string; opportunity_type: string; prompt_query: string; cited_engine?: string; target_url: string; dead_competitor_url?: string | null; competitor_domain?: string | null; http_status?: number | null; matched_user_live_url?: string | null; similarity_score?: number | null; brand_mentioned?: boolean | null; contact_email_or_link?: string | null; outreach_draft?: string | null; corrective_schema_json?: string | null; verification_status?: string | null; lifecycle_stage?: string; relevance_score?: number; buyer_intent_score?: number; citation_evidence_score?: number; replacement_quality_score?: number; composite_priority_score?: number; stage_history_json?: Array<{ stage: string; at: string; actor_user_id: string; note: string }>; last_checked_at?: string | null; created_at?: string | null };
        Update: { id?: string; audit_id?: string | null; domain?: string; opportunity_type?: string; prompt_query?: string; cited_engine?: string; target_url?: string; dead_competitor_url?: string | null; competitor_domain?: string | null; http_status?: number | null; matched_user_live_url?: string | null; similarity_score?: number | null; brand_mentioned?: boolean | null; contact_email_or_link?: string | null; outreach_draft?: string | null; corrective_schema_json?: string | null; verification_status?: string | null; lifecycle_stage?: string; relevance_score?: number; buyer_intent_score?: number; citation_evidence_score?: number; replacement_quality_score?: number; composite_priority_score?: number; stage_history_json?: Array<{ stage: string; at: string; actor_user_id: string; note: string }>; last_checked_at?: string | null; created_at?: string | null };
        Relationships: [{ foreignKeyName: "citation_hijack_opportunities_audit_id_fkey"; columns: ["audit_id"]; isOneToOne: false; referencedRelation: "audits"; referencedColumns: ["id"] }];
      };
      cms_connections: {
        Row: { id: string; user_id: string; domain: string; platform: "shopify" | "wordpress" | "vercel"; shop_subdomain: string | null; access_token: string; created_at: string };
        Insert: { id?: string; user_id: string; domain: string; platform: "shopify" | "wordpress" | "vercel"; shop_subdomain?: string | null; access_token: string; created_at?: string };
        Update: { id?: string; user_id?: string; domain?: string; platform?: "shopify" | "wordpress" | "vercel"; shop_subdomain?: string | null; access_token?: string; created_at?: string };
        Relationships: [];
      };
      broken_links: {
        Row: { id: string; audit_id: string; cited_url: string; http_status: number; suggested_redirect: string | null; url_state: string; approval_status: string; approved_by: string | null; approved_at: string | null; previous_destination_url: string | null; deployed_at: string | null; rolled_back_at: string | null; match_evidence_reason: string | null; match_confidence: number | null; created_at: string };
        Insert: { id?: string; audit_id: string; cited_url: string; http_status: number; suggested_redirect?: string | null; url_state?: string; approval_status?: string; approved_by?: string | null; approved_at?: string | null; previous_destination_url?: string | null; deployed_at?: string | null; rolled_back_at?: string | null; match_evidence_reason?: string | null; match_confidence?: number | null; created_at?: string };
        Update: { id?: string; audit_id?: string; cited_url?: string; http_status?: number; suggested_redirect?: string | null; url_state?: string; approval_status?: string; approved_by?: string | null; approved_at?: string | null; previous_destination_url?: string | null; deployed_at?: string | null; rolled_back_at?: string | null; match_evidence_reason?: string | null; match_confidence?: number | null; created_at?: string };
        Relationships: [{ foreignKeyName: "broken_links_audit_id_fkey"; columns: ["audit_id"]; isOneToOne: false; referencedRelation: "audits"; referencedColumns: ["id"] }];
      };
      redirect_rules: {
        Row: { id: string; user_id: string; source_link_id: string | null; source_host: string; source_path: string; destination: string; active: boolean; domain: string; target_url: string; confidence: number | null; is_active: boolean; hits_recovered: number; synced_to_cms: boolean; shopify_redirect_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; source_link_id?: string | null; source_host: string; source_path: string; destination: string; active?: boolean; domain?: string; target_url?: string; confidence?: number | null; is_active?: boolean; hits_recovered?: number; synced_to_cms?: boolean; shopify_redirect_id?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; source_link_id?: string | null; source_host?: string; source_path?: string; destination?: string; active?: boolean; domain?: string; target_url?: string; confidence?: number | null; is_active?: boolean; hits_recovered?: number; synced_to_cms?: boolean; shopify_redirect_id?: string | null; created_at?: string; updated_at?: string };
        Relationships: [{ foreignKeyName: "redirect_rules_source_link_id_fkey"; columns: ["source_link_id"]; isOneToOne: false; referencedRelation: "broken_links"; referencedColumns: ["id"] }];
      };
      ai_404_events: {
        Row: { id: string; domain: string; broken_path: string; ai_referrer: string; redirected_to: string | null; user_agent: string; created_at: string };
        Insert: { id?: string; domain: string; broken_path: string; ai_referrer?: string; redirected_to?: string | null; user_agent?: string; created_at?: string };
        Update: { id?: string; domain?: string; broken_path?: string; ai_referrer?: string; redirected_to?: string | null; user_agent?: string; created_at?: string };
        Relationships: [];
      };
      weekly_scan_runs: {
        Row: { id: string; week_start: string; status: string; total_jobs: number; lease_token: string | null; last_error: string | null; created_at: string; updated_at: string; finished_at: string | null; digests_prepared_at: string | null };
        Insert: { id?: string; week_start: string; status?: string; total_jobs?: number; lease_token?: string | null; last_error?: string | null; created_at?: string; updated_at?: string; finished_at?: string | null; digests_prepared_at?: string | null };
        Update: { id?: string; week_start?: string; status?: string; total_jobs?: number; lease_token?: string | null; last_error?: string | null; created_at?: string; updated_at?: string; finished_at?: string | null; digests_prepared_at?: string | null };
        Relationships: [];
      };
      weekly_scan_jobs: {
        Row: { id: string; run_id: string; user_id: string; domain: string; buyer_prompt: string; status: string; attempts: number; lease_token: string | null; started_at: string | null; finished_at: string | null; audit_id: string | null; last_error: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; run_id: string; user_id: string; domain: string; buyer_prompt: string; status?: string; attempts?: number; lease_token?: string | null; started_at?: string | null; finished_at?: string | null; audit_id?: string | null; last_error?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; run_id?: string; user_id?: string; domain?: string; buyer_prompt?: string; status?: string; attempts?: number; lease_token?: string | null; started_at?: string | null; finished_at?: string | null; audit_id?: string | null; last_error?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      weekly_scan_digests: {
        Row: { id: string; run_id: string; user_id: string; status: string; lease_token: string | null; started_at: string | null; finished_at: string | null; last_error: string | null; provider_message_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; run_id: string; user_id: string; status?: string; lease_token?: string | null; started_at?: string | null; finished_at?: string | null; last_error?: string | null; provider_message_id?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; run_id?: string; user_id?: string; status?: string; lease_token?: string | null; started_at?: string | null; finished_at?: string | null; last_error?: string | null; provider_message_id?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      subscriptions: {
        Row: { id: string; user_id: string; store_id: string; product_id: string; variant_id: string; customer_id: string | null; order_id: string | null; status: string; plan: string | null; current_period_end: string | null; email: string | null; domain: string | null; renews_at: string | null; ends_at: string | null; cancelled: boolean; provider_updated_at: string | null; created_at: string; updated_at: string };
        Insert: { id: string; user_id: string; store_id: string; product_id: string; variant_id: string; customer_id?: string | null; order_id?: string | null; status: string; plan?: string | null; current_period_end?: string | null; email?: string | null; domain?: string | null; renews_at?: string | null; ends_at?: string | null; cancelled?: boolean; provider_updated_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; store_id?: string; product_id?: string; variant_id?: string; customer_id?: string | null; order_id?: string | null; status?: string; plan?: string | null; current_period_end?: string | null; email?: string | null; domain?: string | null; renews_at?: string | null; ends_at?: string | null; cancelled?: boolean; provider_updated_at?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
    };
    Views: { [key in never]: never };
    Functions: {
      claim_pixel_intercept_quota: { Args: { target_domain: string }; Returns: boolean };
      reserve_workspace_agent_scan: { Args: { p_user_id: string; p_workspace_domain: string }; Returns: boolean };
      match_sitemap_url: {
        Args: { query_embedding: string; target_domain: string; match_threshold: number; match_count: number; query_model?: string };
        Returns: { url: string; similarity: number }[];
      };
    };
    Enums: { [key in never]: never };
    CompositeTypes: { [key in never]: never };
  };
};
