begin;

alter table public.audits add column if not exists sitemap_url_count integer not null default 0 check (sitemap_url_count between 0 and 100000);

create table if not exists public.ai_observation_evidence (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  domain text not null,
  prompt_query text not null,
  prompt_version text not null,
  provider text not null,
  model_name text not null,
  search_method text not null,
  locale text not null default 'en-US',
  raw_answer text not null,
  extracted_urls_json jsonb not null default '[]'::jsonb check (jsonb_typeof(extracted_urls_json) = 'array'),
  sample_size integer not null default 1 check (sample_size between 1 and 100),
  observation_confidence numeric(5,2) check (observation_confidence is null or observation_confidence between 0 and 100),
  job_status text not null default 'completed' check (job_status in ('queued','running','completed','failed')),
  retry_count integer not null default 0 check (retry_count between 0 and 20),
  error_message text,
  observed_at timestamptz not null default now()
);
create index if not exists ai_observation_evidence_audit_time_idx on public.ai_observation_evidence(audit_id, observed_at desc);
create index if not exists ai_observation_evidence_domain_prompt_idx on public.ai_observation_evidence(domain, prompt_query, observed_at desc);
alter table public.ai_observation_evidence enable row level security;
revoke all on public.ai_observation_evidence from public, anon, authenticated;
grant all on public.ai_observation_evidence to service_role;

create table if not exists public.recovery_outcomes (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  domain text not null,
  broken_link_id uuid references public.broken_links(id) on delete set null,
  canonical_destination_url text not null,
  technical_deployment_verified_at timestamptz,
  ai_citation_observed_at timestamptz,
  evidence_id uuid references public.ai_observation_evidence(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(audit_id, broken_link_id, canonical_destination_url)
);
create index if not exists recovery_outcomes_audit_idx on public.recovery_outcomes(audit_id, created_at desc);
alter table public.recovery_outcomes enable row level security;
revoke all on public.recovery_outcomes from public, anon, authenticated;
grant all on public.recovery_outcomes to service_role;

commit;
