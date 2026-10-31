begin;

create table if not exists public.subscriptions (
  id text primary key,
  user_id text not null,
  store_id text not null,
  product_id text not null,
  variant_id text not null,
  customer_id text,
  order_id text,
  status text not null,
  renews_at timestamp with time zone,
  ends_at timestamp with time zone,
  cancelled boolean not null default false,
  provider_updated_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists subscriptions_user_id_status_idx
  on public.subscriptions (user_id, status);

alter table public.subscriptions enable row level security;

comment on table public.subscriptions is
  'Lemon Squeezy subscription state synchronized only by the server-side signed webhook.';

commit;
