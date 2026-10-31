export type Database = {
  public: {
    Tables: {
      audits: {
        Row: { id: string; user_id: string | null; domain: string; status: string; created_at: string };
        Insert: { id?: string; user_id?: string | null; domain: string; status?: string; created_at?: string };
        Update: { id?: string; user_id?: string | null; domain?: string; status?: string; created_at?: string };
        Relationships: [];
      };
      broken_links: {
        Row: { id: string; audit_id: string; cited_url: string; http_status: number; suggested_redirect: string | null; created_at: string };
        Insert: { id?: string; audit_id: string; cited_url: string; http_status: number; suggested_redirect?: string | null; created_at?: string };
        Update: { id?: string; audit_id?: string; cited_url?: string; http_status?: number; suggested_redirect?: string | null; created_at?: string };
        Relationships: [{ foreignKeyName: "broken_links_audit_id_fkey"; columns: ["audit_id"]; isOneToOne: false; referencedRelation: "audits"; referencedColumns: ["id"] }];
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
