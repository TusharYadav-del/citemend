begin;

alter table public.ai_observation_evidence
  add column if not exists retrieved_urls_json text[] not null default '{}',
  add column if not exists rendered_urls_json text[] not null default '{}';

create table if not exists public.ai_provenance_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workspace_domain text not null,
  source_kind text not null check (source_kind in ('cloudflare_logpush','shopify_webhook','server_log')),
  event_type text not null check (event_type in ('crawler_fetch','ai_referral','shopify_order')),
  page_url text,
  crawler_name text,
  crawler_verified boolean not null default false,
  referral_host text,
  journey_hash text,
  order_ref_hash text,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  constraint ai_provenance_events_host_check check (workspace_domain = lower(workspace_domain) and workspace_domain ~ '^[a-z0-9.-]+$'),
  constraint ai_provenance_events_payload_check check (
    (event_type = 'crawler_fetch' and page_url is not null and crawler_name is not null)
    or (event_type = 'ai_referral' and referral_host is not null)
    or (event_type = 'shopify_order' and order_ref_hash is not null)
  )
);

create index if not exists ai_provenance_workspace_time_idx on public.ai_provenance_events(user_id, workspace_domain, occurred_at desc);
create index if not exists ai_provenance_event_type_idx on public.ai_provenance_events(user_id, workspace_domain, event_type, occurred_at desc);

alter table public.ai_provenance_events enable row level security;
drop policy if exists ai_provenance_owner_select on public.ai_provenance_events;
create policy ai_provenance_owner_select on public.ai_provenance_events for select to authenticated using (user_id = auth.jwt()->>'sub');
revoke all on public.ai_provenance_events from anon, authenticated;
grant select on public.ai_provenance_events to authenticated;
grant all on public.ai_provenance_events to service_role;

create or replace function public.citemend_readiness_schema_status()
returns table(table_name text, table_exists boolean, rls_enabled boolean, policy_count integer)
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  with required(name) as (values
    ('audits'),('broken_links'),('recovery_findings'),('subscriptions'),('weekly_scan_runs'),('weekly_scan_jobs'),('weekly_scan_digests'),
    ('redirect_rules'),('sitemap_pages'),('audit_citation_gaps'),('ai_404_events'),('citation_hijack_opportunities'),
    ('cms_connections'),('rescued_ai_visits'),('workspace_integrations'),('pixel_intercept_quotas'),('action_audit_logs'),
    ('ai_observation_evidence'),('ai_provenance_events'),('recovery_outcomes'),('webhook_events_log'),('billing_webhook_events'),('workspace_api_keys'),('autonomous_agent_runs'),
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
