begin;

create table if not exists public.recovery_findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  broken_link_id uuid references public.broken_links(id) on delete set null,
  domain text not null,
  finding_type text not null default 'dead_url' check (finding_type in ('dead_url','price_mismatch','inventory_mismatch','policy_dead_end','feed_inconsistency')),
  normalized_path text not null,
  signal_evidence jsonb not null default '{"observed_404_visits":0,"external_referrers":0,"citation_snapshots":0,"user_agent_verified":false,"priority_score":0}'::jsonb,
  guardrail_classification text not null check (guardrail_classification in ('recoverable_equivalent','leave_as_404_or_410','chain_or_loop_risk')),
  approval_status text not null default 'pending_human_review' check (approval_status in ('pending_human_review','approved','rejected_bad_recommendation','deployed')),
  suggested_target_url text,
  confidence_score numeric(5,2),
  match_reason text not null,
  rejected_soft_404_count integer not null default 0,
  blocked_loop_count integer not null default 0,
  created_at timestamptz not null default now(),
  check (confidence_score is null or confidence_score between 0 and 100)
);

create index if not exists recovery_findings_audit_idx on public.recovery_findings(audit_id, created_at desc);
create index if not exists recovery_findings_group_idx on public.recovery_findings(domain, normalized_path, finding_type);
create index if not exists recovery_findings_review_idx on public.recovery_findings(approval_status, created_at desc);
create unique index if not exists recovery_findings_audit_group_uidx on public.recovery_findings(audit_id, normalized_path, finding_type);
alter table public.recovery_findings enable row level security;
revoke all on public.recovery_findings from anon, authenticated;
grant all on public.recovery_findings to service_role;

create or replace function public.citemend_readiness_schema_status()
returns table(table_name text, table_exists boolean, rls_enabled boolean, policy_count integer)
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  with required(name) as (values
    ('audits'),('broken_links'),('recovery_findings'),('subscriptions'),('weekly_scan_runs'),('weekly_scan_jobs'),('weekly_scan_digests'),
    ('redirect_rules'),('sitemap_pages'),('audit_citation_gaps'),('ai_404_events'),('citation_hijack_opportunities'),
    ('cms_connections'),('rescued_ai_visits'),('workspace_integrations'),('pixel_intercept_quotas'),('action_audit_logs'),
    ('ai_observation_evidence'),('recovery_outcomes'),('webhook_events_log'),('billing_webhook_events'),('workspace_api_keys'),('autonomous_agent_runs'),
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
