-- Migration 017 is already used by 017_batch3_engine_matrix_integrations.sql.
-- Keep migration history immutable and add Sprint 8 acquisition tables forward-only.
begin;

-- Pixel telemetry predates workspaces. Tag new events with the audit owner so
-- tenant-scoped case studies never attribute domain-wide legacy traffic.
alter table public.rescued_ai_visits
  add column if not exists user_id text;
create index if not exists rescued_ai_visits_owner_domain_created_idx
  on public.rescued_ai_visits(user_id,domain,created_at desc)
  where user_id is not null;

create table if not exists public.case_studies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^cs_[a-f0-9]{32}$'),
  user_id text not null,
  workspace_domain text not null,
  audit_id uuid not null references public.audits(id) on delete cascade,
  anonymized boolean not null default true,
  is_public boolean not null default true,
  study_json jsonb not null check (jsonb_typeof(study_json) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists case_studies_workspace_created_idx on public.case_studies(user_id,workspace_domain,created_at desc);
alter table public.case_studies enable row level security;
revoke all on public.case_studies from public,anon,authenticated;
grant all on public.case_studies to service_role;

create table if not exists public.design_partner_applications (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null check (length(contact_name) between 1 and 120),
  contact_email text not null check (length(contact_email) between 3 and 320),
  company_name text not null check (length(company_name) between 1 and 160),
  domain text not null,
  segment text not null check (segment in ('agency','saas','ecommerce')),
  client_or_catalog_size integer not null check (client_or_catalog_size between 1 and 1000000),
  buyer_prompt text not null check (length(buyer_prompt) between 8 and 4000),
  primary_pain_point text not null check (length(primary_pain_point) between 12 and 1200),
  teaser_status text not null default 'unavailable' check (teaser_status in ('complete','partial','unavailable')),
  teaser_json jsonb check (teaser_json is null or jsonb_typeof(teaser_json) = 'object'),
  status text not null default 'new' check (status in ('new','reviewed','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists design_partner_applications_status_created_idx on public.design_partner_applications(status,created_at desc);
create index if not exists design_partner_applications_domain_idx on public.design_partner_applications(domain,created_at desc);
alter table public.design_partner_applications enable row level security;
revoke all on public.design_partner_applications from public,anon,authenticated;
grant all on public.design_partner_applications to service_role;

create table if not exists public.agency_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_application_id uuid references public.design_partner_applications(id) on delete set null,
  referrer_user_id text,
  referral_code text not null unique check (referral_code ~ '^[a-zA-Z0-9_-]{6,64}$'),
  referred_email text,
  status text not null default 'issued' check (status in ('issued','visited','applied','qualified','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agency_referrals_referrer_idx on public.agency_referrals(referrer_user_id,created_at desc);
alter table public.agency_referrals enable row level security;
revoke all on public.agency_referrals from public,anon,authenticated;
grant all on public.agency_referrals to service_role;

-- A single hashed key row per caller and action provides an atomic fixed window.
-- No raw IP address is stored; all visitor data stays server-side.
create table if not exists public.forensic_teaser_rate_windows (
  key_id text primary key check (key_id ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default date_trunc('minute',now()),
  request_count integer not null default 0 check (request_count >= 0)
);
alter table public.forensic_teaser_rate_windows enable row level security;
revoke all on public.forensic_teaser_rate_windows from public,anon,authenticated;
grant all on public.forensic_teaser_rate_windows to service_role;

create or replace function public.consume_forensic_teaser_rate_limit(p_key_id text,p_limit integer)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare allowed boolean;
begin
  if p_key_id !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into public.forensic_teaser_rate_windows(key_id,window_started_at,request_count)
  values(p_key_id,date_trunc('minute',now()),1)
  on conflict(key_id) do update set
    window_started_at=case when forensic_teaser_rate_windows.window_started_at < date_trunc('minute',now()) then date_trunc('minute',now()) else forensic_teaser_rate_windows.window_started_at end,
    request_count=case when forensic_teaser_rate_windows.window_started_at < date_trunc('minute',now()) then 1 else forensic_teaser_rate_windows.request_count+1 end
  returning request_count <= greatest(1,least(p_limit,20)) into allowed;
  return coalesce(allowed,false);
end;
$$;
revoke all on function public.consume_forensic_teaser_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.consume_forensic_teaser_rate_limit(text,integer) to service_role;

-- Keep the production doctor aware of the latest supported application tables.
create or replace function public.citemend_readiness_schema_status()
returns table(table_name text, table_exists boolean, rls_enabled boolean, policy_count integer)
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with required(name) as (values
    ('audits'),('broken_links'),('subscriptions'),('weekly_scan_runs'),('weekly_scan_jobs'),('weekly_scan_digests'),
    ('redirect_rules'),('sitemap_pages'),('audit_citation_gaps'),('ai_404_events'),('citation_hijack_opportunities'),
    ('cms_connections'),('rescued_ai_visits'),('workspace_integrations'),('pixel_intercept_quotas'),('action_audit_logs'),
    ('ai_observation_evidence'),('recovery_outcomes'),('webhook_events_log'),('workspace_api_keys'),
    ('autonomous_agent_runs'),('ecommerce_catalog_items'),('organization_members'),('workspace_governance_policies'),
    ('scheduled_reports'),('citation_change_events'),('workspace_api_rate_windows'),('workspace_operating_metrics'),
    ('case_studies'),('design_partner_applications'),('agency_referrals'),('forensic_teaser_rate_windows')
  )
  select required.name,
    c.oid is not null,
    coalesce(c.relrowsecurity, false),
    (select count(*)::integer from pg_catalog.pg_policy p where p.polrelid = c.oid)
  from required
  left join pg_catalog.pg_class c on c.relname = required.name and c.relkind in ('r','p')
  left join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.oid is null or n.oid is not null
$$;
revoke all on function public.citemend_readiness_schema_status() from public,anon,authenticated;
grant execute on function public.citemend_readiness_schema_status() to service_role;

notify pgrst,'reload schema';
commit;
