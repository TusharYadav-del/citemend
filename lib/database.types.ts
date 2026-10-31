export type Database = {
  public: {
    Tables: {
      audits: {
        Row: { id: string; user_id: string | null; domain: string; buyer_prompt: string | null; status: string; created_at: string };
        Insert: { id?: string; user_id?: string | null; domain: string; buyer_prompt?: string | null; status?: string; created_at?: string };
        Update: { id?: string; user_id?: string | null; domain?: string; buyer_prompt?: string | null; status?: string; created_at?: string };
        Relationships: [];
      };
      broken_links: {
        Row: { id: string; audit_id: string; cited_url: string; http_status: number; suggested_redirect: string | null; created_at: string };
        Insert: { id?: string; audit_id: string; cited_url: string; http_status: number; suggested_redirect?: string | null; created_at?: string };
        Update: { id?: string; audit_id?: string; cited_url?: string; http_status?: number; suggested_redirect?: string | null; created_at?: string };
        Relationships: [{ foreignKeyName: "broken_links_audit_id_fkey"; columns: ["audit_id"]; isOneToOne: false; referencedRelation: "audits"; referencedColumns: ["id"] }];
      };
      weekly_scan_runs: {
        Row: { id: string; week_start: string; status: string; total_jobs: number; lease_token: string | null; last_error: string | null; created_at: string; updated_at: string; finished_at: string | null };
        Insert: { id?: string; week_start: string; status?: string; total_jobs?: number; lease_token?: string | null; last_error?: string | null; created_at?: string; updated_at?: string; finished_at?: string | null };
        Update: { id?: string; week_start?: string; status?: string; total_jobs?: number; lease_token?: string | null; last_error?: string | null; created_at?: string; updated_at?: string; finished_at?: string | null };
        Relationships: [];
      };
      weekly_scan_jobs: {
        Row: { id: string; run_id: string; user_id: string; domain: string; buyer_prompt: string; status: string; attempts: number; lease_token: string | null; started_at: string | null; finished_at: string | null; audit_id: string | null; last_error: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; run_id: string; user_id: string; domain: string; buyer_prompt: string; status?: string; attempts?: number; lease_token?: string | null; started_at?: string | null; finished_at?: string | null; audit_id?: string | null; last_error?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; run_id?: string; user_id?: string; domain?: string; buyer_prompt?: string; status?: string; attempts?: number; lease_token?: string | null; started_at?: string | null; finished_at?: string | null; audit_id?: string | null; last_error?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      subscriptions: {
        Row: { id: string; user_id: string; store_id: string; product_id: string; variant_id: string; customer_id: string | null; order_id: string | null; status: string; renews_at: string | null; ends_at: string | null; cancelled: boolean; provider_updated_at: string | null; created_at: string; updated_at: string };
        Insert: { id: string; user_id: string; store_id: string; product_id: string; variant_id: string; customer_id?: string | null; order_id?: string | null; status: string; renews_at?: string | null; ends_at?: string | null; cancelled?: boolean; provider_updated_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; store_id?: string; product_id?: string; variant_id?: string; customer_id?: string | null; order_id?: string | null; status?: string; renews_at?: string | null; ends_at?: string | null; cancelled?: boolean; provider_updated_at?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
    };
    Views: { [key in never]: never };
    Functions: { [key in never]: never };
    Enums: { [key in never]: never };
    CompositeTypes: { [key in never]: never };
  };
};
