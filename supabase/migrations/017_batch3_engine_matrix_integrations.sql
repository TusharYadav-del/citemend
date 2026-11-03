begin;

alter table public.audits
  add column if not exists share_of_model_score integer default 0,
  add column if not exists engine_matrix_json jsonb default '[]'::jsonb,
  add column if not exists agency_brand_name text,
  add column if not exists agency_logo_url text,
  add column if not exists agency_primary_color text default '#10B981',
  add column if not exists agency_cta_url text,
  add column if not exists agency_cta_text text;

create table if not exists public.rescued_ai_visits (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  broken_path text not null,
  rescued_target_url text not null,
  ai_referrer text not null,
  similarity_score double precision default 1.0,
  latency_ms integer default 0,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists idx_rescued_visits_domain_date
  on public.rescued_ai_visits(domain, created_at desc);

create table if not exists public.workspace_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  domain text not null,
  slack_webhook_url text,
  discord_webhook_url text,
  shopify_store_domain text,
  shopify_admin_token text,
  vercel_project_id text,
  agency_brand_name text,
  agency_logo_url text,
  agency_primary_color text default '#10B981',
  agency_cta_text text default 'Book Your Free AI Search Recovery Call',
  agency_cta_url text,
  updated_at timestamptz default now(),
  unique(user_id, domain)
);

commit;
