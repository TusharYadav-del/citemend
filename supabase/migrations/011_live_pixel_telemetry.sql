begin;

-- redirect_rules already exists and is used by the Day 23 edge Worker.
-- Keep its owner/RLS columns and add the live-pixel names as synchronized
-- compatibility columns instead of replacing the established table.
alter table public.redirect_rules
  add column domain text,
  add column target_url text,
  add column confidence real,
  add column is_active boolean,
  add column hits_recovered integer;

update public.redirect_rules
set domain = source_host,
    target_url = destination,
    is_active = active,
    hits_recovered = 0;

alter table public.redirect_rules
  alter column domain set not null,
  alter column target_url set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column hits_recovered set default 0,
  alter column hits_recovered set not null,
  add constraint redirect_rules_domain_source_path_key unique (domain, source_path),
  add constraint redirect_rules_domain_check check (domain = lower(domain) and domain <> ''),
  add constraint redirect_rules_confidence_check check (confidence is null or confidence between 0 and 1),
  add constraint redirect_rules_hits_recovered_check check (hits_recovered >= 0);

create or replace function public.sync_redirect_rule_telemetry_columns()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.domain := coalesce(new.domain, new.source_host);
    new.source_host := coalesce(new.source_host, new.domain);
    if new.domain is distinct from new.source_host then
      raise exception 'domain and source_host must match';
    end if;

    new.target_url := coalesce(new.target_url, new.destination);
    new.destination := coalesce(new.destination, new.target_url);
    if new.target_url is distinct from new.destination then
      raise exception 'target_url and destination must match';
    end if;

    -- If old and new callers disagree, inactive is the safe outcome.
    new.is_active := coalesce(new.is_active, new.active, true) and coalesce(new.active, new.is_active, true);
    new.active := new.is_active;
    new.hits_recovered := coalesce(new.hits_recovered, 0);
  else
    if new.domain is distinct from old.domain then
      new.source_host := new.domain;
    elsif new.source_host is distinct from old.source_host then
      new.domain := new.source_host;
    end if;

    if new.target_url is distinct from old.target_url then
      new.destination := new.target_url;
    elsif new.destination is distinct from old.destination then
      new.target_url := new.destination;
    end if;

    if new.is_active is distinct from old.is_active then
      new.active := new.is_active;
    elsif new.active is distinct from old.active then
      new.is_active := new.active;
    end if;
  end if;

  return new;
end;
$$;

create trigger redirect_rules_sync_telemetry_columns
before insert or update on public.redirect_rules
for each row execute function public.sync_redirect_rule_telemetry_columns();

grant all on public.redirect_rules to service_role;
comment on column public.redirect_rules.domain is 'Compatibility name for source_host used by live-pixel telemetry.';
comment on column public.redirect_rules.target_url is 'Compatibility name for destination used by live-pixel telemetry.';
comment on column public.redirect_rules.confidence is 'Optional normalized match confidence from 0 to 1; null for legacy manually approved rules.';
comment on column public.redirect_rules.hits_recovered is 'Count of visitors recovered by this rule.';

create table public.ai_404_events (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain = lower(domain) and domain <> ''),
  broken_path text not null check (left(broken_path, 1) = '/'),
  ai_referrer text not null default '',
  redirected_to text,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index ai_404_events_domain_created_at_idx
  on public.ai_404_events (domain, created_at desc);
create index ai_404_events_broken_path_created_at_idx
  on public.ai_404_events (domain, broken_path, created_at desc);

alter table public.ai_404_events enable row level security;
revoke all on public.ai_404_events from public, anon, authenticated;
grant all on public.ai_404_events to service_role;

comment on table public.ai_404_events is
  'Server-only telemetry for 404 visits attributed to AI referrers and recovered redirect destinations.';

commit;
