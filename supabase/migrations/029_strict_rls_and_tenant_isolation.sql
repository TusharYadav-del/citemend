-- Migration 016 is already used by 016_citation_hijack_opportunities.sql.
-- This forward-only hardening migration therefore follows migration 028.
begin;

create or replace function public.citemend_current_clerk_user_id()
returns text
language sql stable security invoker
set search_path = pg_catalog, auth, pg_temp
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

create or replace function public.citemend_current_clerk_org_id()
returns text
language sql stable security invoker
set search_path = pg_catalog, auth, pg_temp
as $$
  select coalesce(nullif(auth.jwt() ->> 'org_id', ''), nullif(auth.jwt() ->> 'organization_id', ''))
$$;

create or replace function public.citemend_organization_role(p_owner_user_id text, p_organization_id text)
returns text
language plpgsql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  actor_id text := public.citemend_current_clerk_user_id();
  org_id text := public.citemend_current_clerk_org_id();
  result_role text;
begin
  if actor_id is null or org_id is null or org_id <> p_organization_id then
    return null;
  end if;
  if actor_id = p_owner_user_id then
    return 'owner';
  end if;
  select m.role into result_role
  from public.organization_members m
  where m.owner_user_id = p_owner_user_id
    and m.organization_id = org_id
    and m.member_user_id = actor_id
  limit 1;
  return result_role;
end;
$$;

create or replace function public.citemend_workspace_role(p_owner_user_id text, p_workspace_domain text)
returns text
language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select case
    when public.citemend_current_clerk_user_id() = p_owner_user_id then 'owner'
    else public.citemend_organization_role(p_owner_user_id, public.citemend_current_clerk_org_id())
  end
$$;

create or replace function public.citemend_workspace_permission(p_owner_user_id text, p_workspace_domain text, p_permission text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select case p_permission
    when 'read' then public.citemend_workspace_role(p_owner_user_id, p_workspace_domain) in ('owner','admin','editor','viewer')
    when 'write' then public.citemend_workspace_role(p_owner_user_id, p_workspace_domain) in ('owner','admin','editor')
    when 'manage' then public.citemend_workspace_role(p_owner_user_id, p_workspace_domain) in ('owner','admin')
    when 'owner' then public.citemend_workspace_role(p_owner_user_id, p_workspace_domain) = 'owner'
    else false
  end
$$;

create or replace function public.citemend_audit_record_permission(
  p_audit_id uuid,
  p_owner_user_id text,
  p_workspace_domain text,
  p_permission text
)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select exists (
    select 1 from public.audits a
    where a.id = p_audit_id
      and (p_owner_user_id is null or a.user_id = p_owner_user_id)
      and (p_workspace_domain is null or a.domain = p_workspace_domain)
      and public.citemend_workspace_permission(a.user_id, a.domain, p_permission)
  )
$$;

create or replace function public.citemend_domain_permission(p_workspace_domain text, p_permission text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select exists (
    select 1 from public.audits a
    where a.domain = p_workspace_domain
      and public.citemend_workspace_permission(a.user_id, a.domain, p_permission)
  )
$$;

revoke all on function public.citemend_current_clerk_user_id() from public, anon;
revoke all on function public.citemend_current_clerk_org_id() from public, anon;
revoke all on function public.citemend_organization_role(text,text) from public, anon;
revoke all on function public.citemend_workspace_role(text,text) from public, anon;
revoke all on function public.citemend_workspace_permission(text,text,text) from public, anon;
revoke all on function public.citemend_audit_record_permission(uuid,text,text,text) from public, anon;
revoke all on function public.citemend_domain_permission(text,text) from public, anon;
grant execute on function public.citemend_current_clerk_user_id() to authenticated, service_role;
grant execute on function public.citemend_current_clerk_org_id() to authenticated, service_role;
grant execute on function public.citemend_organization_role(text,text) to authenticated, service_role;
grant execute on function public.citemend_workspace_role(text,text) to authenticated, service_role;
grant execute on function public.citemend_workspace_permission(text,text,text) to authenticated, service_role;
grant execute on function public.citemend_audit_record_permission(uuid,text,text,text) to authenticated, service_role;
grant execute on function public.citemend_domain_permission(text,text) to authenticated, service_role;

do $rls_tables$
declare
  t text;
begin
  foreach t in array array[
    'audits','broken_links','subscriptions','weekly_scan_runs','weekly_scan_jobs','weekly_scan_digests',
    'redirect_rules','sitemap_pages','audit_citation_gaps','ai_404_events','citation_hijack_opportunities',
    'cms_connections','rescued_ai_visits','workspace_integrations','pixel_intercept_quotas','action_audit_logs',
    'ai_observation_evidence','recovery_outcomes','webhook_events_log','workspace_api_keys',
    'autonomous_agent_runs','ecommerce_catalog_items','organization_members','workspace_governance_policies',
    'scheduled_reports','citation_change_events','workspace_api_rate_windows','workspace_operating_metrics'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$rls_tables$;

-- Remove prior app policies before restoring the deliberately scoped policy set.
do $drop_policies$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'audits','broken_links','subscriptions','weekly_scan_runs','weekly_scan_jobs','weekly_scan_digests',
        'redirect_rules','sitemap_pages','audit_citation_gaps','ai_404_events','citation_hijack_opportunities',
        'cms_connections','rescued_ai_visits','workspace_integrations','pixel_intercept_quotas','action_audit_logs',
        'ai_observation_evidence','recovery_outcomes','webhook_events_log','workspace_api_keys',
        'autonomous_agent_runs','ecommerce_catalog_items','organization_members','workspace_governance_policies',
        'scheduled_reports','citation_change_events','workspace_api_rate_windows','workspace_operating_metrics'
      ])
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$drop_policies$;

-- Audit records are readable by verified workspace members. Editors may submit
-- and update scans; only workspace owners can delete them.
grant select (id,user_id,domain,status,created_at,buyer_prompt,competitor_domains,ground_truth_pricing,
  share_of_model_score,engine_matrix_json,agency_brand_name,agency_logo_url,agency_primary_color,
  agency_cta_url,agency_cta_text,llms_txt_content,sitemap_url_count,completed_at)
  on public.audits to authenticated;
grant insert (user_id,domain,status,buyer_prompt,competitor_domains,ground_truth_pricing,share_of_model_score,
  engine_matrix_json,agency_brand_name,agency_logo_url,agency_primary_color,agency_cta_url,agency_cta_text,llms_txt_content,sitemap_url_count)
  on public.audits to authenticated;
grant update (status,buyer_prompt,competitor_domains,ground_truth_pricing,share_of_model_score,engine_matrix_json,
  agency_brand_name,agency_logo_url,agency_primary_color,agency_cta_url,agency_cta_text,llms_txt_content,sitemap_url_count)
  on public.audits to authenticated;
grant delete on public.audits to authenticated;
create policy audits_workspace_select on public.audits for select to authenticated
  using (public.citemend_workspace_permission(user_id, domain, 'read'));
create policy audits_workspace_insert on public.audits for insert to authenticated
  with check (public.citemend_workspace_permission(user_id, domain, 'write'));
create policy audits_workspace_update on public.audits for update to authenticated
  using (public.citemend_workspace_permission(user_id, domain, 'write'))
  with check (public.citemend_workspace_permission(user_id, domain, 'write'));
create policy audits_workspace_delete on public.audits for delete to authenticated
  using (public.citemend_workspace_permission(user_id, domain, 'owner'));

grant select on public.broken_links to authenticated;
grant insert, update, delete on public.broken_links to authenticated;
create policy broken_links_workspace_select on public.broken_links for select to authenticated
  using (public.citemend_audit_record_permission(audit_id, null, null, 'read'));
create policy broken_links_workspace_insert on public.broken_links for insert to authenticated
  with check (public.citemend_audit_record_permission(audit_id, null, null, 'write'));
create policy broken_links_workspace_update on public.broken_links for update to authenticated
  using (public.citemend_audit_record_permission(audit_id, null, null, 'manage'))
  with check (public.citemend_audit_record_permission(audit_id, null, null, 'manage'));
create policy broken_links_workspace_delete on public.broken_links for delete to authenticated
  using (public.citemend_audit_record_permission(audit_id, null, null, 'owner'));

grant select on public.subscriptions to authenticated;
create policy subscriptions_user_select on public.subscriptions for select to authenticated
  using (user_id = public.citemend_current_clerk_user_id());

-- Weekly schedulers, telemetry, credentials, rate windows, outbound integration
-- tokens, and append-only audit logs remain service-role-only; RLS defaults deny.

grant select on public.redirect_rules to authenticated;
grant insert, update, delete on public.redirect_rules to authenticated;
create policy redirect_rules_workspace_select on public.redirect_rules for select to authenticated
  using (public.citemend_workspace_permission(user_id, source_host, 'read'));
create policy redirect_rules_workspace_insert on public.redirect_rules for insert to authenticated
  with check (public.citemend_workspace_permission(user_id, source_host, 'manage'));
create policy redirect_rules_workspace_update on public.redirect_rules for update to authenticated
  using (public.citemend_workspace_permission(user_id, source_host, 'manage'))
  with check (public.citemend_workspace_permission(user_id, source_host, 'manage'));
create policy redirect_rules_workspace_delete on public.redirect_rules for delete to authenticated
  using (public.citemend_workspace_permission(user_id, source_host, 'manage'));
grant select (source_host,source_path,destination,active) on public.redirect_rules to anon;
create policy "Public may read approved active redirect targets"
  on public.redirect_rules for select to anon
  using (active = true and source_link_id is not null and public.redirect_source_approved(source_link_id));

grant select on public.audit_citation_gaps to authenticated;
create policy audit_citation_gaps_workspace_select on public.audit_citation_gaps for select to authenticated
  using (public.citemend_audit_record_permission(audit_id,user_id,domain,'read'));

grant select on public.citation_hijack_opportunities to authenticated;
create policy citation_hijack_workspace_select on public.citation_hijack_opportunities for select to authenticated
  using (audit_id is not null and public.citemend_audit_record_permission(audit_id,null,domain,'read'));

grant select on public.ai_observation_evidence to authenticated;
create policy ai_observation_evidence_workspace_select on public.ai_observation_evidence for select to authenticated
  using (public.citemend_audit_record_permission(audit_id,null,domain,'read'));

grant select on public.recovery_outcomes to authenticated;
create policy recovery_outcomes_workspace_select on public.recovery_outcomes for select to authenticated
  using (public.citemend_audit_record_permission(audit_id,null,domain,'read'));

grant select on public.autonomous_agent_runs to authenticated;
create policy autonomous_agent_runs_workspace_select on public.autonomous_agent_runs for select to authenticated
  using (public.citemend_audit_record_permission(audit_id,user_id,workspace_domain,'read'));

grant select on public.ecommerce_catalog_items to authenticated;
grant insert, update, delete on public.ecommerce_catalog_items to authenticated;
create policy ecommerce_catalog_workspace_select on public.ecommerce_catalog_items for select to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'read'));
create policy ecommerce_catalog_workspace_insert on public.ecommerce_catalog_items for insert to authenticated
  with check (public.citemend_workspace_permission(user_id,workspace_domain,'manage'));
create policy ecommerce_catalog_workspace_update on public.ecommerce_catalog_items for update to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'manage'))
  with check (public.citemend_workspace_permission(user_id,workspace_domain,'manage'));
create policy ecommerce_catalog_workspace_delete on public.ecommerce_catalog_items for delete to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'manage'));

grant select on public.organization_members to authenticated;
create policy organization_members_workspace_select on public.organization_members for select to authenticated
  using (public.citemend_organization_role(owner_user_id,organization_id) in ('owner','admin','editor','viewer'));

grant select on public.workspace_governance_policies to authenticated;
grant insert, update, delete on public.workspace_governance_policies to authenticated;
create policy governance_workspace_select on public.workspace_governance_policies for select to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'read'));
create policy governance_workspace_insert on public.workspace_governance_policies for insert to authenticated
  with check (public.citemend_workspace_permission(user_id,workspace_domain,'manage'));
create policy governance_workspace_update on public.workspace_governance_policies for update to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'manage'))
  with check (public.citemend_workspace_permission(user_id,workspace_domain,'manage'));
create policy governance_workspace_delete on public.workspace_governance_policies for delete to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'owner'));

grant select on public.scheduled_reports to authenticated;
grant insert, update, delete on public.scheduled_reports to authenticated;
create policy scheduled_reports_workspace_select on public.scheduled_reports for select to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'read'));
create policy scheduled_reports_workspace_insert on public.scheduled_reports for insert to authenticated
  with check (public.citemend_workspace_permission(user_id,workspace_domain,'manage'));
create policy scheduled_reports_workspace_update on public.scheduled_reports for update to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'manage'))
  with check (public.citemend_workspace_permission(user_id,workspace_domain,'manage'));
create policy scheduled_reports_workspace_delete on public.scheduled_reports for delete to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'manage'));

grant select on public.citation_change_events to authenticated;
create policy citation_change_workspace_select on public.citation_change_events for select to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'read'));

grant select on public.workspace_operating_metrics to authenticated;
create policy operating_metrics_workspace_select on public.workspace_operating_metrics for select to authenticated
  using (public.citemend_workspace_permission(user_id,workspace_domain,'read'));

-- API key hashes are never readable by authenticated clients. Owners can list
-- the safe display metadata, retire a key, or delete it; creation stays server-only.
grant select (id,user_id,workspace_domain,key_prefix,permissions_json,rate_limit_per_minute,last_used_at,created_at,revoked_at)
  on public.workspace_api_keys to authenticated;
grant update (revoked_at) on public.workspace_api_keys to authenticated;
grant delete on public.workspace_api_keys to authenticated;
create policy workspace_api_keys_owner_select on public.workspace_api_keys for select to authenticated
  using (user_id = public.citemend_current_clerk_user_id());
create policy workspace_api_keys_owner_update on public.workspace_api_keys for update to authenticated
  using (user_id = public.citemend_current_clerk_user_id())
  with check (user_id = public.citemend_current_clerk_user_id());
create policy workspace_api_keys_owner_delete on public.workspace_api_keys for delete to authenticated
  using (user_id = public.citemend_current_clerk_user_id());

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
    ('scheduled_reports'),('citation_change_events'),('workspace_api_rate_windows'),('workspace_operating_metrics')
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
revoke all on function public.citemend_readiness_schema_status() from public, anon, authenticated;
grant execute on function public.citemend_readiness_schema_status() to service_role;

notify pgrst, 'reload schema';
commit;
