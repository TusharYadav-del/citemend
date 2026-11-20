create table if not exists public.workspace_domains (
  owner_user_id text not null,
  domain text not null check (domain = lower(domain) and length(domain) between 3 and 253),
  created_at timestamptz not null default now(),
  primary key (owner_user_id, domain)
);

alter table public.workspace_domains enable row level security;
revoke all on public.workspace_domains from public, anon, authenticated;
grant all on public.workspace_domains to service_role;

insert into public.workspace_domains (owner_user_id, domain)
select distinct user_id, lower(domain)
from public.audits
where user_id is not null and domain is not null
on conflict (owner_user_id, domain) do nothing;
