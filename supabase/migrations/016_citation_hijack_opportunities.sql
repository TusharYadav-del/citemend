begin;

alter table public.audits
  add column if not exists competitor_domains text[] not null default '{}',
  add column if not exists ground_truth_pricing text,
  add column if not exists indexnow_key text;

create table if not exists public.citation_hijack_opportunities (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid references public.audits(id) on delete cascade,
  domain text not null,
  opportunity_type text not null check (opportunity_type in (
    'competitor_direct_404', 'listicle_outbound_404', 'listicle_missing_brand',
    'reddit_citation_thread', 'entity_pricing_mismatch'
  )),
  prompt_query text not null,
  cited_engine text not null default 'Groq+Tavily',
  target_url text not null,
  dead_competitor_url text,
  competitor_domain text,
  http_status integer,
  matched_user_live_url text,
  similarity_score double precision,
  brand_mentioned boolean default false,
  contact_email_or_link text,
  outreach_draft text,
  corrective_schema_json text,
  verification_status text default 'unverified' check (verification_status in ('unverified', 'pending_recheck', 'verified_won')),
  last_checked_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_hijack_audit_id on public.citation_hijack_opportunities(audit_id);
create index if not exists idx_hijack_domain on public.citation_hijack_opportunities(domain);

alter table public.citation_hijack_opportunities enable row level security;
revoke all on table public.citation_hijack_opportunities from anon, authenticated;
grant all on table public.citation_hijack_opportunities to service_role;

commit;
