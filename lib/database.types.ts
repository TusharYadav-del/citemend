export type Database = {
  public: {
    Tables: {
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
        Row: { id: string; user_id: string | null; domain: string; buyer_prompt: string | null; webhook_url: string | null; status: string; created_at: string };
        Insert: { id?: string; user_id?: string | null; domain: string; buyer_prompt?: string | null; webhook_url?: string | null; status?: string; created_at?: string };
        Update: { id?: string; user_id?: string | null; domain?: string; buyer_prompt?: string | null; webhook_url?: string | null; status?: string; created_at?: string };
        Relationships: [];
      };
      cms_connections: {
        Row: { id: string; user_id: string; domain: string; platform: "shopify" | "wordpress" | "vercel"; shop_subdomain: string | null; access_token: string; created_at: string };
        Insert: { id?: string; user_id: string; domain: string; platform: "shopify" | "wordpress" | "vercel"; shop_subdomain?: string | null; access_token: string; created_at?: string };
        Update: { id?: string; user_id?: string; domain?: string; platform?: "shopify" | "wordpress" | "vercel"; shop_subdomain?: string | null; access_token?: string; created_at?: string };
        Relationships: [];
      };
      broken_links: {
        Row: { id: string; audit_id: string; cited_url: string; http_status: number; suggested_redirect: string | null; created_at: string };
        Insert: { id?: string; audit_id: string; cited_url: string; http_status: number; suggested_redirect?: string | null; created_at?: string };
        Update: { id?: string; audit_id?: string; cited_url?: string; http_status?: number; suggested_redirect?: string | null; created_at?: string };
        Relationships: [{ foreignKeyName: "broken_links_audit_id_fkey"; columns: ["audit_id"]; isOneToOne: false; referencedRelation: "audits"; referencedColumns: ["id"] }];
      };
      redirect_rules: {
        Row: { id: string; user_id: string; source_link_id: string | null; source_host: string; source_path: string; destination: string; active: boolean; domain: string; target_url: string; confidence: number | null; is_active: boolean; hits_recovered: number; synced_to_cms: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; source_link_id?: string | null; source_host: string; source_path: string; destination: string; active?: boolean; domain?: string; target_url?: string; confidence?: number | null; is_active?: boolean; hits_recovered?: number; synced_to_cms?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; source_link_id?: string | null; source_host?: string; source_path?: string; destination?: string; active?: boolean; domain?: string; target_url?: string; confidence?: number | null; is_active?: boolean; hits_recovered?: number; synced_to_cms?: boolean; created_at?: string; updated_at?: string };
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
      match_sitemap_url: {
        Args: { query_embedding: string; target_domain: string; match_threshold: number; match_count: number; query_model?: string };
        Returns: { url: string; similarity: number }[];
      };
    };
    Enums: { [key in never]: never };
    CompositeTypes: { [key in never]: never };
  };
};
