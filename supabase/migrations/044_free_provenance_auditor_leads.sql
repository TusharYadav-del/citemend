begin;

create table if not exists public.free_provenance_leads (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain = lower(domain) and length(domain) between 4 and 253),
  page_url text not null check (length(page_url) between 10 and 2048),
  contact_email text not null check (length(contact_email) between 3 and 320),
  created_at timestamptz not null default now()
);
create index if not exists free_provenance_leads_created_idx on public.free_provenance_leads(created_at desc);
alter table public.free_provenance_leads enable row level security;
revoke all on public.free_provenance_leads from public, anon, authenticated;
grant all on public.free_provenance_leads to service_role;

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
    ('design_partner_applications'),('agency_referrals'),('forensic_teaser_rate_windows'),('free_provenance_leads'),('background_jobs'),
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
