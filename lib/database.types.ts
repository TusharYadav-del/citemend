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
    };
    Views: { [key in never]: never };
    Functions: { [key in never]: never };
    Enums: { [key in never]: never };
    CompositeTypes: { [key in never]: never };
  };
};
