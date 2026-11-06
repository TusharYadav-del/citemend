-- Sprint 9 forward-only distribution and opt-in benchmark support.
begin;

alter table public.agency_referrals
  add column if not exists referrer_workspace_domain text,
  add column if not exists visit_count integer not null default 0 check (visit_count >= 0),
  add column if not exists last_visited_at timestamptz,
  add column if not exists referred_workspace_domain text,
  add column if not exists referred_workspace_user_id text,
  add column if not exists converted_at timestamptz;
create index if not exists agency_referrals_workspace_idx
  on public.agency_referrals(referrer_user_id, referrer_workspace_domain, created_at desc);
create index if not exists agency_referrals_conversion_idx
  on public.agency_referrals(referred_workspace_user_id, referred_workspace_domain)
  where referred_workspace_user_id is not null;

create or replace function public.record_agency_referral_visit(p_referral_code text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare updated_id uuid;
begin
  if p_referral_code !~ '^agency_[a-f0-9]{24}$' then return false; end if;
  update public.agency_referrals
  set visit_count = visit_count + 1,
      last_visited_at = now(),
      status = case when status = 'issued' then 'visited' else status end,
      updated_at = now()
  where referral_code = p_referral_code and status <> 'expired'
  returning id into updated_id;
  return updated_id is not null;
end;
$$;
revoke all on function public.record_agency_referral_visit(text) from public,anon,authenticated;
grant execute on function public.record_agency_referral_visit(text) to service_role;

-- This service-role-only view function is consumed on the server; the public
-- page receives aggregated results only, never workspace, domain, or prompt data.
create or replace function public.citemend_opt_in_benchmark_observations()
returns table(workspace_key text, workspace_domain text, model_name text, job_status text, extracted_urls_json jsonb, url_status_json jsonb)
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  select g.user_id || ':' || g.workspace_domain,
         g.workspace_domain,
         e.model_name,
         e.job_status,
         to_jsonb(e.extracted_urls_json),
         e.url_status_json
  from public.ai_observation_evidence e
  join public.workspace_governance_policies g
    on g.user_id = (select a.user_id from public.audits a where a.id = e.audit_id)
   and g.workspace_domain = e.domain
  where g.allow_benchmark_aggregation = true
    and e.job_status = 'completed'
  order by e.observed_at desc
  limit 20000
$$;
revoke all on function public.citemend_opt_in_benchmark_observations() from public,anon,authenticated;
grant execute on function public.citemend_opt_in_benchmark_observations() to service_role;

create or replace function public.citemend_readiness_schema_status()
returns table(table_name text, table_exists boolean, rls_enabled boolean, policy_count integer)
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  with required(name) as (values
    ('audits'),('broken_links'),('subscriptions'),('weekly_scan_runs'),('weekly_scan_jobs'),('weekly_scan_digests'),
    ('redirect_rules'),('sitemap_pages'),('audit_citation_gaps'),('ai_404_events'),('citation_hijack_opportunities'),
    ('cms_connections'),('rescued_ai_visits'),('workspace_integrations'),('pixel_intercept_quotas'),('action_audit_logs'),
    ('ai_observation_evidence'),('recovery_outcomes'),('webhook_events_log'),('workspace_api_keys'),
    ('autonomous_agent_runs'),('ecommerce_catalog_items'),('organization_members'),('workspace_governance_policies'),
    ('scheduled_reports'),('citation_change_events'),('workspace_api_rate_windows'),('workspace_operating_metrics'),
    ('case_studies'),('design_partner_applications'),('agency_referrals'),('forensic_teaser_rate_windows')
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

notify pgrst,'reload schema';
commit;
