begin;

alter table public.weekly_scan_runs add column if not exists digests_prepared_at timestamptz;

create table if not exists public.weekly_scan_digests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.weekly_scan_runs(id) on delete cascade,
  user_id text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'skipped')),
  lease_token uuid,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, user_id)
);

create index if not exists weekly_scan_digests_queue_idx
  on public.weekly_scan_digests (run_id, status, created_at);

alter table public.weekly_scan_digests enable row level security;
comment on table public.weekly_scan_digests is
  'One durable email digest per Pro user and weekly run; server-side service access only.';

commit;
