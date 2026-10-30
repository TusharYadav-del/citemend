begin;

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  status text not null default 'pending',
  created_at timestamp with time zone not null default now()
);

create table public.broken_links (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  cited_url text not null,
  http_status integer not null,
  suggested_redirect text,
  created_at timestamp with time zone not null default now()
);

create index broken_links_audit_id_idx on public.broken_links (audit_id);

-- Keep audit data private until authentication and ownership policies exist.
-- The SQL Editor can manage rows; the public client cannot access rows yet.
alter table public.audits enable row level security;
alter table public.broken_links enable row level security;

commit;
