begin;

-- Retain the legacy columns used by beta grants and existing Pro/Agency checks.
alter table public.subscriptions
  add column if not exists lemonsqueezy_customer_id text,
  add column if not exists lemonsqueezy_subscription_id text,
  add column if not exists lemonsqueezy_order_id text,
  add column if not exists plan_name text,
  add column if not exists test_mode boolean,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists customer_portal_url text,
  add column if not exists update_payment_method_url text;

update public.subscriptions
set lemonsqueezy_subscription_id = id,
    lemonsqueezy_customer_id = customer_id,
    lemonsqueezy_order_id = order_id,
    plan_name = case when plan = 'agency' then 'agency' end
where plan in ('pro', 'agency') and id ~ '^[0-9]+$' and lemonsqueezy_subscription_id is null;

create unique index if not exists subscriptions_lemonsqueezy_id_key
  on public.subscriptions (lemonsqueezy_subscription_id) where lemonsqueezy_subscription_id is not null;
create index if not exists subscriptions_user_billing_idx
  on public.subscriptions (user_id, updated_at desc) where lemonsqueezy_subscription_id is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_billing_plan_name_check') then
    alter table public.subscriptions add constraint subscriptions_billing_plan_name_check
      check (plan_name is null or plan_name in ('free','starter','growth','agency')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_billing_status_check') then
    alter table public.subscriptions add constraint subscriptions_billing_status_check
      check (lemonsqueezy_subscription_id is null or status in ('on_trial','active','paused','past_due','unpaid','cancelled','expired')) not valid;
  end if;
end $$;

alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public, anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
drop policy if exists subscriptions_user_select on public.subscriptions;
create policy subscriptions_user_select on public.subscriptions for select to authenticated
  using (user_id = public.citemend_current_clerk_user_id());

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  event_name text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);
alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_webhook_events from public, anon, authenticated;
grant all on public.billing_webhook_events to service_role;

-- One database transaction claims the delivery and applies its state change.
-- A failed mutation rolls back its claim, so Lemon Squeezy can safely retry.
create or replace function public.apply_billing_webhook_event(
  p_hash text, p_event_name text, p_payload jsonb, p_record jsonb default null
) returns text
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_event_id uuid;
  v_id text;
  v_existing public.subscriptions%rowtype;
  v_time timestamptz;
  v_owner text;
begin
  if p_hash !~ '^[a-f0-9]{64}$' or p_event_name is null or p_payload is null then
    raise exception 'Invalid billing event';
  end if;
  insert into public.billing_webhook_events(event_hash, event_name, payload)
  values (p_hash, p_event_name, p_payload)
  on conflict (event_hash) do nothing returning id into v_event_id;
  if v_event_id is null then return 'duplicate'; end if;
  if p_record is null then return 'processed'; end if;

  v_id := p_record ->> 'id';
  v_owner := nullif(p_record ->> 'user_id', '');
  v_time := (p_record ->> 'provider_updated_at')::timestamptz;
  if v_id is null or v_time is null or (p_record ->> 'plan_name') not in ('starter','growth','agency')
     or (p_record ->> 'status') not in ('on_trial','active','paused','past_due','unpaid','cancelled','expired') then
    raise exception 'Invalid subscription state';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_id));
  select * into v_existing from public.subscriptions where id = v_id for update;
  if found then
    if v_existing.plan = 'pro_beta' or (v_owner is not null and v_owner <> v_existing.user_id) then
      raise exception 'Subscription owner mismatch';
    end if;
    if v_existing.provider_updated_at > v_time or
       (v_existing.provider_updated_at = v_time and v_existing.cancelled and coalesce((p_record ->> 'cancelled')::boolean, false) = false) then
      return 'ignored';
    end if;
  elsif v_owner is null then
    raise exception 'Subscription owner is missing';
  end if;

  insert into public.subscriptions (
    id, user_id, store_id, product_id, variant_id, customer_id, order_id,
    lemonsqueezy_customer_id, lemonsqueezy_subscription_id, lemonsqueezy_order_id,
    plan, plan_name, status, test_mode, renews_at, ends_at, trial_ends_at,
    customer_portal_url, update_payment_method_url, cancelled, provider_updated_at, email, updated_at
  ) values (
    v_id, coalesce(v_existing.user_id, v_owner), p_record ->> 'store_id', p_record ->> 'product_id',
    p_record ->> 'variant_id', p_record ->> 'customer_id', p_record ->> 'order_id',
    p_record ->> 'customer_id', v_id, p_record ->> 'order_id',
    p_record ->> 'plan', p_record ->> 'plan_name', p_record ->> 'status',
    (p_record ->> 'test_mode')::boolean, (p_record ->> 'renews_at')::timestamptz,
    (p_record ->> 'ends_at')::timestamptz, (p_record ->> 'trial_ends_at')::timestamptz,
    p_record ->> 'customer_portal_url', p_record ->> 'update_payment_method_url',
    (p_record ->> 'cancelled')::boolean, v_time, coalesce(p_record ->> 'email', v_existing.email), now()
  ) on conflict (id) do update set
    store_id = excluded.store_id, product_id = excluded.product_id, variant_id = excluded.variant_id,
    customer_id = excluded.customer_id, order_id = excluded.order_id,
    lemonsqueezy_customer_id = excluded.lemonsqueezy_customer_id,
    lemonsqueezy_subscription_id = excluded.lemonsqueezy_subscription_id,
    lemonsqueezy_order_id = excluded.lemonsqueezy_order_id,
    plan = excluded.plan, plan_name = excluded.plan_name, status = excluded.status,
    test_mode = excluded.test_mode, renews_at = excluded.renews_at, ends_at = excluded.ends_at,
    trial_ends_at = excluded.trial_ends_at, customer_portal_url = excluded.customer_portal_url,
    update_payment_method_url = excluded.update_payment_method_url, cancelled = excluded.cancelled,
    provider_updated_at = excluded.provider_updated_at, email = excluded.email, updated_at = now();
  return 'processed';
end;
$$;
revoke all on function public.apply_billing_webhook_event(text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_billing_webhook_event(text,text,jsonb,jsonb) to service_role;

create or replace function public.citemend_readiness_schema_status()
returns table(table_name text, table_exists boolean, rls_enabled boolean, policy_count integer)
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  with required(name) as (values
    ('audits'),('broken_links'),('subscriptions'),('weekly_scan_runs'),('weekly_scan_jobs'),('weekly_scan_digests'),
    ('redirect_rules'),('sitemap_pages'),('audit_citation_gaps'),('ai_404_events'),('citation_hijack_opportunities'),
    ('cms_connections'),('rescued_ai_visits'),('workspace_integrations'),('pixel_intercept_quotas'),('action_audit_logs'),
    ('ai_observation_evidence'),('recovery_outcomes'),('webhook_events_log'),('billing_webhook_events'),('workspace_api_keys'),('autonomous_agent_runs'),
    ('ecommerce_catalog_items'),('organization_members'),('workspace_governance_policies'),('scheduled_reports'),
    ('citation_change_events'),('workspace_api_rate_windows'),('workspace_operating_metrics'),('case_studies'),
    ('design_partner_applications'),('agency_referrals'),('forensic_teaser_rate_windows'),('background_jobs'),
    ('founder_weekly_scorecards'),('support_tickets'),('outreach_prospects'),('outreach_evidence'),('outreach_contacts'),
    ('outreach_campaigns'),('outreach_emails'),('outreach_events'),('outreach_suppressions'),('outreach_daily_runs'),('outreach_settings')
  ) select required.name,c.oid is not null,coalesce(c.relrowsecurity,false),
    (select count(*)::integer from pg_catalog.pg_policy p where p.polrelid=c.oid)
  from required left join pg_catalog.pg_class c on c.relname=required.name and c.relkind in ('r','p')
  left join pg_catalog.pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where c.oid is null or n.oid is not null
$$;
revoke all on function public.citemend_readiness_schema_status() from public,anon,authenticated;
grant execute on function public.citemend_readiness_schema_status() to service_role;

notify pgrst, 'reload schema';

commit;
