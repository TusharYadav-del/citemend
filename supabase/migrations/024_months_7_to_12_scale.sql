begin;

create table if not exists public.workspace_governance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workspace_domain text not null,
  monthly_scan_quota integer not null default 20 check (monthly_scan_quota between 0 and 100000),
  scans_used_this_month integer not null default 0 check (scans_used_this_month between 0 and 100000),
  usage_month date not null default date_trunc('month', now())::date,
  entity_truth_baseline_json jsonb not null default '{}'::jsonb check (jsonb_typeof(entity_truth_baseline_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, workspace_domain)
);

create table if not exists public.autonomous_agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workspace_domain text not null,
  audit_id uuid not null references public.audits(id) on delete cascade,
  opportunity_id uuid references public.citation_hijack_opportunities(id) on delete set null,
  broken_link_id uuid references public.broken_links(id) on delete set null,
  action_type text not null check (action_type in ('capsule_draft','jsonld_recommendation','forensic_diagnosis','llms_txt_preview','entity_baseline_update','schedule_reverification','shopify_301_deploy','vercel_301_export','cloudflare_301_export','publisher_outreach_draft')),
  risk_level text not null check (risk_level in ('low_risk_auto','medium_risk_review','high_risk_external_approval')),
  current_step text not null default 'discover' check (current_step in ('discover','investigate','recommend','request_approval','execute','verify','rollback')),
  run_status text not null default 'queued' check (run_status in ('queued','awaiting_approval','running','completed','awaiting_external_deploy','failed','rolled_back')),
  human_approved_by text,
  human_approved_at timestamptz,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  recommendation_json jsonb not null default '{}'::jsonb check (jsonb_typeof(recommendation_json) = 'object'),
  result_json jsonb not null default '{}'::jsonb check (jsonb_typeof(result_json) = 'object'),
  stage_history_json jsonb not null default '[]'::jsonb check (jsonb_typeof(stage_history_json) = 'array'),
  rollback_snapshot_json jsonb,
  rollback_completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists autonomous_agent_runs_owner_queue_idx on public.autonomous_agent_runs(user_id, workspace_domain, created_at desc);
create index if not exists autonomous_agent_runs_status_queue_idx on public.autonomous_agent_runs(run_status, created_at asc);

create table if not exists public.ecommerce_catalog_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workspace_domain text not null,
  platform text not null,
  external_item_id text not null,
  canonical_url text,
  product_json jsonb not null default '{}'::jsonb check (jsonb_typeof(product_json) = 'object'),
  synced_at timestamptz not null default now(),
  unique(user_id, workspace_domain, platform, external_item_id)
);
create index if not exists ecommerce_catalog_items_workspace_idx on public.ecommerce_catalog_items(user_id, workspace_domain, synced_at desc);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  owner_user_id text not null,
  member_user_id text not null,
  role text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  unique(organization_id, member_user_id)
);
create index if not exists organization_members_owner_idx on public.organization_members(owner_user_id, organization_id);

create table if not exists public.scheduled_reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workspace_domain text not null,
  report_type text not null default 'reverification' check (report_type in ('reverification','weekly_summary','citation_changes')),
  schedule_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','running','completed','cancelled','failed')),
  payload_json jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scheduled_reports_workspace_due_idx on public.scheduled_reports(workspace_domain, schedule_at asc) where status = 'scheduled';

create table if not exists public.citation_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workspace_domain text not null,
  audit_id uuid references public.audits(id) on delete set null,
  previous_observation_id uuid references public.ai_observation_evidence(id) on delete set null,
  current_observation_id uuid references public.ai_observation_evidence(id) on delete set null,
  prompt_query text not null,
  event_type text not null check (event_type in ('citation_appeared','citation_disappeared','source_replaced')),
  source_url text not null,
  replacement_url text,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  detected_at timestamptz not null default now()
);
create index if not exists citation_change_workspace_timeline_idx on public.citation_change_events(user_id, workspace_domain, detected_at desc);

create or replace function public.reserve_workspace_agent_scan(p_user_id text, p_workspace_domain text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare allowed boolean;
begin
  insert into public.workspace_governance_policies(user_id, workspace_domain)
  values (p_user_id, p_workspace_domain)
  on conflict (user_id, workspace_domain) do nothing;
  update public.workspace_governance_policies
  set usage_month = date_trunc('month', now())::date,
      scans_used_this_month = case when usage_month < date_trunc('month', now())::date then 0 else scans_used_this_month end,
      updated_at = now()
  where user_id = p_user_id and workspace_domain = p_workspace_domain;
  update public.workspace_governance_policies
  set scans_used_this_month = scans_used_this_month + 1, updated_at = now()
  where user_id = p_user_id and workspace_domain = p_workspace_domain
    and scans_used_this_month < monthly_scan_quota
  returning true into allowed;
  return coalesce(allowed, false);
end;
$$;

revoke all on function public.reserve_workspace_agent_scan(text, text) from public, anon, authenticated;
grant execute on function public.reserve_workspace_agent_scan(text, text) to service_role;

do $$ declare t text;
begin
  foreach t in array array['autonomous_agent_runs','ecommerce_catalog_items','organization_members','workspace_governance_policies','scheduled_reports','citation_change_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

commit;
