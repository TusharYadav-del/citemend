begin;

alter table public.subscriptions add column if not exists plan text;
alter table public.subscriptions add column if not exists current_period_end timestamptz;
alter table public.subscriptions add column if not exists email text;
alter table public.subscriptions add column if not exists domain text;

create unique index if not exists subscriptions_one_beta_per_user_idx
  on public.subscriptions (user_id) where plan = 'pro_beta';

create unique index if not exists subscriptions_one_beta_per_email_idx
  on public.subscriptions (lower(email)) where plan = 'pro_beta' and email is not null;

create index if not exists subscriptions_beta_expiry_idx
  on public.subscriptions (status, current_period_end) where plan = 'pro_beta';

comment on column public.subscriptions.plan is
  'Null for Lemon Squeezy rows; pro_beta for a design-partner request or grant.';
comment on column public.subscriptions.current_period_end is
  'The non-renewing expiry of a pro_beta grant; null for a pending request.';
comment on column public.subscriptions.email is
  'Clerk primary email captured for a design-partner request.';
comment on column public.subscriptions.domain is
  'Validated domain requested for beta monitoring.';
comment on table public.subscriptions is
  'Lemon Squeezy webhook state and server-only design-partner beta requests.';

commit;
