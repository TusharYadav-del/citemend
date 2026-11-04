begin;

create table if not exists public.action_audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_domain text not null,
  actor_user_id text not null,
  action_type text not null check (action_type in ('redirect_preview', 'redirect_approval', 'redirect_conflict_rejection', 'redirect_deployment', 'redirect_rollback', 'data_export')),
  target_url text,
  previous_state_json jsonb,
  new_state_json jsonb,
  safety_check_passed boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists action_audit_logs_workspace_created_idx
  on public.action_audit_logs(workspace_domain, created_at desc);
alter table public.action_audit_logs enable row level security;
revoke all on table public.action_audit_logs from public, anon, authenticated;
grant select, insert on table public.action_audit_logs to service_role;

create or replace function public.reject_action_audit_log_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'action_audit_logs is append-only';
end;
$$;
revoke all on function public.reject_action_audit_log_mutation() from public, anon, authenticated;
grant execute on function public.reject_action_audit_log_mutation() to service_role;
drop trigger if exists action_audit_logs_immutable on public.action_audit_logs;
create trigger action_audit_logs_immutable
  before update or delete on public.action_audit_logs
  for each row execute function public.reject_action_audit_log_mutation();

alter table public.citation_hijack_opportunities
  add column if not exists lifecycle_stage text not null default 'discovered',
  add column if not exists relevance_score integer not null default 0,
  add column if not exists buyer_intent_score integer not null default 0,
  add column if not exists citation_evidence_score integer not null default 0,
  add column if not exists replacement_quality_score integer not null default 0,
  add column if not exists composite_priority_score integer not null default 0,
  add column if not exists stage_history_json jsonb not null default '[]'::jsonb;

alter table public.citation_hijack_opportunities
  add constraint citation_hijack_lifecycle_stage_check check (lifecycle_stage in ('discovered', 'reviewed', 'contacted', 'replied', 'link_updated', 'ai_citation_observed')),
  add constraint citation_hijack_relevance_score_check check (relevance_score between 0 and 100),
  add constraint citation_hijack_buyer_intent_score_check check (buyer_intent_score between 0 and 100),
  add constraint citation_hijack_citation_evidence_score_check check (citation_evidence_score between 0 and 100),
  add constraint citation_hijack_replacement_quality_score_check check (replacement_quality_score between 0 and 100),
  add constraint citation_hijack_composite_priority_score_check check (composite_priority_score between 0 and 100),
  add constraint citation_hijack_stage_history_array_check check (jsonb_typeof(stage_history_json) = 'array');

update public.citation_hijack_opportunities
set relevance_score = case when opportunity_type in ('competitor_direct_404', 'listicle_outbound_404') then 80 else 65 end,
    buyer_intent_score = case when prompt_query ~* '(best|alternative|compare|pricing|price|buy|purchase|tool|software|service|recommend)' then 85 else 55 end,
    citation_evidence_score = case when http_status in (404, 410) then 95 when opportunity_type = 'reddit_citation_thread' then 75 else 65 end,
    replacement_quality_score = case when matched_user_live_url is not null then greatest(65, least(100, round(60 + coalesce(similarity_score, 0.375) * 40)::integer)) else 20 end;
update public.citation_hijack_opportunities
set composite_priority_score = round((relevance_score + buyer_intent_score + citation_evidence_score + replacement_quality_score) / 4.0)::integer;

create index if not exists citation_hijack_stage_priority_idx
  on public.citation_hijack_opportunities(lifecycle_stage, composite_priority_score desc);

commit;
