-- Migration 019 is already used by pixel interception quotas. Add support
-- storage as a forward-only migration and keep ticket access server-side.
begin;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  workspace_domain text,
  user_id text not null,
  user_email text not null,
  category text not null check (category in ('bug_report','redirect_help','billing_question','agency_partnership','enterprise_security','feature_request')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent_agency')),
  subject text not null check (length(subject) between 4 and 180),
  message text not null check (length(message) between 12 and 8000),
  diagnostic_context_json jsonb not null default '{}'::jsonb check (jsonb_typeof(diagnostic_context_json) = 'object'),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_user_created_idx
  on public.support_tickets(user_id, created_at desc);
create index if not exists support_tickets_workspace_created_idx
  on public.support_tickets(workspace_domain, created_at desc)
  where workspace_domain is not null;

alter table public.support_tickets enable row level security;
revoke all on table public.support_tickets from public, anon, authenticated;
grant all on table public.support_tickets to service_role;

-- Extend the existing server-only readiness inventory with support storage.
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
    ('case_studies'),('design_partner_applications'),('agency_referrals'),('forensic_teaser_rate_windows'),
    ('background_jobs'),('founder_weekly_scorecards'),('support_tickets')
  )
  select required.name, c.oid is not null, coalesce(c.relrowsecurity,false),
    (select count(*)::integer from pg_catalog.pg_policy p where p.polrelid=c.oid)
  from required
  left join pg_catalog.pg_class c on c.relname=required.name and c.relkind in ('r','p')
  left join pg_catalog.pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where c.oid is null or n.oid is not null
$$;
revoke all on function public.citemend_readiness_schema_status() from public,anon,authenticated;
grant execute on function public.citemend_readiness_schema_status() to service_role;

notify pgrst, 'reload schema';
commit;
