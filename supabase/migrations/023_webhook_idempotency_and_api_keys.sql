begin;

create table if not exists public.webhook_events_log (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  provider text not null,
  event_type text not null,
  delivery_status text not null default 'processing' check (delivery_status in ('processing','completed','failed','ignored')),
  retry_count integer not null default 0 check (retry_count between 0 and 20),
  last_error text,
  received_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists webhook_events_status_received_idx on public.webhook_events_log(delivery_status, received_at desc);
alter table public.webhook_events_log enable row level security;
revoke all on public.webhook_events_log from public, anon, authenticated;
grant all on public.webhook_events_log to service_role;

create table if not exists public.workspace_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workspace_domain text not null,
  key_hash text not null unique check (key_hash ~ '^[a-f0-9]{64}$'),
  key_prefix text not null check (key_prefix ~ '^cm_live_[A-Za-z0-9]{4,12}$'),
  permissions_json jsonb not null default '[]'::jsonb check (jsonb_typeof(permissions_json) = 'array'),
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute between 1 and 10000),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists workspace_api_keys_owner_idx on public.workspace_api_keys(user_id, workspace_domain) where revoked_at is null;
alter table public.workspace_api_keys enable row level security;
revoke all on public.workspace_api_keys from public, anon, authenticated;
grant all on public.workspace_api_keys to service_role;

commit;
