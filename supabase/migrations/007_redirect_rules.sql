begin;

create table public.redirect_rules (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_link_id uuid references public.broken_links(id) on delete set null,
  source_host text not null,
  source_path text not null,
  destination text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_host, source_path),
  check (source_host = lower(source_host) and source_host <> ''),
  check (left(source_path, 1) = '/')
);

create index redirect_rules_user_id_idx on public.redirect_rules (user_id);
alter table public.redirect_rules enable row level security;

revoke all on public.redirect_rules from anon, authenticated;
grant select (source_host, source_path, destination, active) on public.redirect_rules to anon;
grant all on public.redirect_rules to service_role;

create policy "Public may read active redirect targets"
  on public.redirect_rules for select to anon using (active = true);

comment on table public.redirect_rules is
  'Owner-approved 301 rules. Anonymous API access is read-only and limited to active routing columns.';

commit;
