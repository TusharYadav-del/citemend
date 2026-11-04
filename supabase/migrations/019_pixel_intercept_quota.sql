begin;

create table if not exists public.pixel_intercept_quotas (
  domain text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.pixel_intercept_quotas enable row level security;
revoke all on public.pixel_intercept_quotas from public, anon, authenticated;
grant all on public.pixel_intercept_quotas to service_role;

-- One row per audited domain. The conditional upsert is atomic across workers.
create or replace function public.claim_pixel_intercept_quota(target_domain text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  allowed boolean;
  current_time_value timestamptz := clock_timestamp();
begin
  if target_domain is null or length(target_domain) > 253 or target_domain <> lower(target_domain)
     or target_domain !~ '^[a-z0-9.-]+$' then
    return false;
  end if;
  insert into public.pixel_intercept_quotas as quota(domain, window_started_at, request_count)
    select target_domain, current_time_value, 1
    where exists (select 1 from public.audits where domain = target_domain and user_id is not null and status in ('completed', 'partial'))
  on conflict (domain) do update set
    window_started_at = case when quota.window_started_at <= current_time_value - interval '1 minute' then current_time_value else quota.window_started_at end,
    request_count = case when quota.window_started_at <= current_time_value - interval '1 minute' then 1 else quota.request_count + 1 end
  where quota.window_started_at <= current_time_value - interval '1 minute' or quota.request_count < 120
  returning true into allowed;
  return coalesce(allowed, false);
end;
$$;

revoke all on function public.claim_pixel_intercept_quota(text) from public, anon, authenticated;
grant execute on function public.claim_pixel_intercept_quota(text) to service_role;
notify pgrst, 'reload schema';
commit;
