begin;

alter table public.workspace_governance_policies
  add column if not exists allow_benchmark_aggregation boolean not null default false,
  add column if not exists benchmark_category text not null default 'other'
    check (benchmark_category in ('b2b_saas','ecommerce','agency','other'));

alter table public.citation_change_events
  drop constraint if exists citation_change_events_event_type_check;
alter table public.citation_change_events
  add constraint citation_change_events_event_type_check
  check (event_type in ('citation_appeared','citation_disappeared','source_replaced','citation_gained','citation_lost','url_broke'));
alter table public.citation_change_events
  add column if not exists new_replacement_url text,
  add column if not exists replaced_by_competitor boolean not null default false;
alter table public.ai_observation_evidence
  add column if not exists url_status_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(url_status_json) = 'object');
create index if not exists citation_change_prompt_timeline_idx
  on public.citation_change_events(user_id, workspace_domain, prompt_query, detected_at desc);
create unique index if not exists citation_change_dedup_idx
  on public.citation_change_events(user_id, current_observation_id, event_type, source_url)
  where current_observation_id is not null;

commit;
