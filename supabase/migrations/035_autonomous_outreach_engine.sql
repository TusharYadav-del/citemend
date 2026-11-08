begin;

create table if not exists public.outreach_prospects (
  id uuid primary key default gen_random_uuid(), domain text not null unique,
  company_name text, category text, country text, website_url text,
  qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  status text not null default 'discovered' check (status in ('discovered','researched','qualified','drafted','sent','replied','suppressed','disqualified','error')),
  company_fit integer not null default 0, decision_maker_score integer not null default 0,
  ai_presence_score integer not null default 0, broken_citation_score integer not null default 0,
  technical_seo_score integer not null default 0, verified_contact_score integer not null default 0,
  personalization_score integer not null default 0, research_json jsonb not null default '{}'::jsonb,
  report_public boolean not null default false, discovered_at timestamptz not null default now(),
  researched_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.outreach_evidence (
  id uuid primary key default gen_random_uuid(), prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  evidence_type text not null, source_url text, title text, excerpt text, observed_state text check (observed_state is null or observed_state in ('hallucinated','missing','404','410','301','200','blocked','timeout','unknown')),
  http_status integer, final_url text, verification_json jsonb not null default '{}'::jsonb, verified_at timestamptz,
  created_at timestamptz not null default now(), unique(prospect_id,evidence_type,source_url)
);
create table if not exists public.outreach_contacts (
  id uuid primary key default gen_random_uuid(), prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  full_name text, title text, email text not null, email_status text not null default 'unknown' check (email_status in ('verified','risky','unknown','invalid','disposable')),
  verification_json jsonb not null default '{}'::jsonb, source_url text not null, is_public boolean not null default true,
  created_at timestamptz not null default now(), unique(prospect_id,email)
);
create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(), name text not null unique, status text not null default 'active' check(status in ('active','paused','completed')),
  daily_target integer not null default 20 check(daily_target between 0 and 100), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.outreach_emails (
  id uuid primary key default gen_random_uuid(), prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  contact_id uuid references public.outreach_contacts(id) on delete set null, campaign_id uuid references public.outreach_campaigns(id) on delete set null,
  provider text, provider_message_id text, recipient text not null, subject text not null, body_text text not null, body_html text not null,
  factuality_report jsonb not null default '{}'::jsonb, status text not null default 'draft' check(status in ('draft','queued','sent','delivered','bounced','complained','failed','unsubscribed')),
  sent_at timestamptz, created_at timestamptz not null default now(), unique(provider,provider_message_id)
);
create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(), email_id uuid references public.outreach_emails(id) on delete set null,
  prospect_id uuid references public.outreach_prospects(id) on delete set null, event_type text not null, provider_event_id text unique,
  payload jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);
create table if not exists public.outreach_suppressions (
  id uuid primary key default gen_random_uuid(), email text not null unique, domain text, reason text not null,
  source text not null default 'system', token_hash text, created_at timestamptz not null default now()
);
create table if not exists public.outreach_daily_runs (
  id uuid primary key default gen_random_uuid(), run_date date not null unique, status text not null default 'running' check(status in ('running','completed','failed','skipped')),
  started_at timestamptz not null default now(), finished_at timestamptz, discovered integer not null default 0,
  researched integer not null default 0, qualified integer not null default 0, emails_sent integer not null default 0,
  sends_reserved integer not null default 0, errors integer not null default 0, telemetry jsonb not null default '{}'::jsonb
);
create table if not exists public.outreach_settings (
  id integer primary key default 1 check(id=1), outreach_enabled boolean not null default false,
  outreach_enabled_override boolean,
  kill_switch boolean not null default false, daily_target integer not null default 20 check(daily_target between 0 and 100),
  daily_send_limit integer not null default 15 check(daily_send_limit between 0 and 100),
  min_qualification_score integer not null default 75 check(min_qualification_score between 0 and 100), updated_at timestamptz not null default now()
);
insert into public.outreach_settings(id,outreach_enabled,outreach_enabled_override,daily_target,daily_send_limit,min_qualification_score)
values(1,false,null,20,15,75) on conflict(id) do nothing;
insert into public.outreach_campaigns(name,status,daily_target)
values('Founder Outreach','active',20) on conflict(name) do nothing;

create index if not exists outreach_prospects_status_idx on public.outreach_prospects(status,qualification_score desc,discovered_at);
create index if not exists outreach_evidence_prospect_idx on public.outreach_evidence(prospect_id,created_at desc);
create index if not exists outreach_contacts_prospect_idx on public.outreach_contacts(prospect_id,email_status);
create index if not exists outreach_emails_status_idx on public.outreach_emails(status,sent_at desc);
create index if not exists outreach_events_prospect_idx on public.outreach_events(prospect_id,occurred_at desc);
create index if not exists outreach_daily_runs_date_idx on public.outreach_daily_runs(run_date desc);

create or replace function public.outreach_begin_daily_run(p_run_date date)
returns table(claimed boolean, run_id uuid)
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare inserted_id uuid;
begin
  insert into public.outreach_daily_runs(run_date,status) values(p_run_date,'running')
  on conflict(run_date) do update set status='running',started_at=now(),finished_at=null
    where public.outreach_daily_runs.status='failed' or public.outreach_daily_runs.started_at < now()-interval '30 minutes'
  returning id into inserted_id;
  if inserted_id is not null then return query select true,inserted_id; return; end if;
  return query select false,r.id from public.outreach_daily_runs r where r.run_date=p_run_date;
end $$;

create or replace function public.outreach_reserve_daily_send(p_run_date date,p_limit integer)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare sent_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('outreach-send:'||p_run_date::text));
  update public.outreach_daily_runs r set sends_reserved=r.sends_reserved+1
    where r.run_date=p_run_date and r.status='running' and r.sends_reserved < greatest(0,p_limit);
  return found;
end $$;

do $$ declare t text; begin
  foreach t in array array['outreach_prospects','outreach_evidence','outreach_contacts','outreach_campaigns','outreach_emails','outreach_events','outreach_suppressions','outreach_daily_runs','outreach_settings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists outreach_admin_service_only on public.%I',t);
    execute format('create policy outreach_admin_service_only on public.%I for all to service_role using (true) with check (true)',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
revoke all on function public.outreach_begin_daily_run(date) from public,anon,authenticated;
revoke all on function public.outreach_reserve_daily_send(date,integer) from public,anon,authenticated;
grant execute on function public.outreach_begin_daily_run(date) to service_role;
grant execute on function public.outreach_reserve_daily_send(date,integer) to service_role;

create or replace function public.citemend_readiness_schema_status()
returns table(table_name text, table_exists boolean, rls_enabled boolean, policy_count integer)
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  with required(name) as (values
    ('audits'),('broken_links'),('subscriptions'),('weekly_scan_runs'),('weekly_scan_jobs'),('weekly_scan_digests'),
    ('redirect_rules'),('sitemap_pages'),('audit_citation_gaps'),('ai_404_events'),('citation_hijack_opportunities'),
    ('cms_connections'),('rescued_ai_visits'),('workspace_integrations'),('pixel_intercept_quotas'),('action_audit_logs'),
    ('ai_observation_evidence'),('recovery_outcomes'),('webhook_events_log'),('workspace_api_keys'),('autonomous_agent_runs'),
    ('ecommerce_catalog_items'),('organization_members'),('workspace_governance_policies'),('scheduled_reports'),
    ('citation_change_events'),('workspace_api_rate_windows'),('workspace_operating_metrics'),('case_studies'),
    ('design_partner_applications'),('agency_referrals'),('forensic_teaser_rate_windows'),('background_jobs'),
    ('founder_weekly_scorecards'),('support_tickets'),('outreach_prospects'),('outreach_evidence'),('outreach_contacts'),
    ('outreach_campaigns'),('outreach_emails'),('outreach_events'),('outreach_suppressions'),('outreach_daily_runs'),('outreach_settings')
  ) select required.name,c.oid is not null,coalesce(c.relrowsecurity,false),
    (select count(*)::integer from pg_catalog.pg_policy p where p.polrelid=c.oid)
  from required left join pg_catalog.pg_class c on c.relname=required.name and c.relkind in ('r','p')
  left join pg_catalog.pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where c.oid is null or n.oid is not null
$$;
revoke all on function public.citemend_readiness_schema_status() from public,anon,authenticated;
grant execute on function public.citemend_readiness_schema_status() to service_role;
commit;
