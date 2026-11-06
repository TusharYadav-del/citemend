begin;
alter table public.workspace_governance_policies add column if not exists observation_retention_days integer not null default 365 check (observation_retention_days in (90,180,365));
alter table public.workspace_governance_policies add column if not exists require_two_person_redirect_approval boolean not null default false;
alter table public.workspace_governance_policies add column if not exists api_rate_limit_per_minute integer not null default 60 check (api_rate_limit_per_minute between 1 and 600);
create table if not exists public.workspace_api_rate_windows (
  key_id uuid primary key references public.workspace_api_keys(id) on delete cascade,
  window_started_at timestamptz not null default date_trunc('minute',now()),
  request_count integer not null default 0 check(request_count >= 0)
);
alter table public.workspace_api_rate_windows enable row level security;
revoke all on public.workspace_api_rate_windows from public,anon,authenticated;
grant all on public.workspace_api_rate_windows to service_role;
create or replace function public.consume_workspace_api_rate_limit(p_key_id uuid,p_limit integer)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare allowed boolean;
begin
  insert into public.workspace_api_rate_windows(key_id,window_started_at,request_count) values(p_key_id,date_trunc('minute',now()),1)
  on conflict(key_id) do update set window_started_at=case when workspace_api_rate_windows.window_started_at < date_trunc('minute',now()) then date_trunc('minute',now()) else workspace_api_rate_windows.window_started_at end,
  request_count=case when workspace_api_rate_windows.window_started_at < date_trunc('minute',now()) then 1 else workspace_api_rate_windows.request_count+1 end
  returning request_count <= greatest(1,least(p_limit,600)) into allowed;
  return coalesce(allowed,false);
end; $$;
revoke all on function public.consume_workspace_api_rate_limit(uuid,integer) from public,anon,authenticated;
grant execute on function public.consume_workspace_api_rate_limit(uuid,integer) to service_role;
commit;
