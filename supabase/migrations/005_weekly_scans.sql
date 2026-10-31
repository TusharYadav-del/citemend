begin;

alter table public.audits add column if not exists buyer_prompt text;
comment on column public.audits.buyer_prompt is
  'Buyer prompt used for future weekly rescans; null for older audits.';

create table if not exists public.weekly_scan_runs (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  status text not null default 'initializing' check (status in ('initializing', 'running', 'completed', 'partial')),
  total_jobs integer not null default 0,
  lease_token uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.weekly_scan_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.weekly_scan_runs(id) on delete cascade,
  user_id text not null,
  domain text not null,
  buyer_prompt text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempts integer not null default 0,
  lease_token uuid,
  started_at timestamptz,
  finished_at timestamptz,
  audit_id uuid references public.audits(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, user_id, domain)
);

create index if not exists weekly_scan_jobs_queue_idx
  on public.weekly_scan_jobs (run_id, status, created_at);

alter table public.weekly_scan_runs enable row level security;
alter table public.weekly_scan_jobs enable row level security;

comment on table public.weekly_scan_runs is 'Weekly scan run logs; server-side service access only.';
comment on table public.weekly_scan_jobs is 'Durable per-domain weekly scan jobs; server-side service access only.';

commit;
