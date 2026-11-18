begin;

-- Provider-neutral fields are additive. Existing Lemon Squeezy records remain readable,
-- while all new purchases are explicitly owned by Dodo Payments.
alter table public.subscriptions
  add column if not exists billing_provider text not null default 'lemonsqueezy';

alter table public.subscriptions drop constraint if exists subscriptions_billing_plan_name_check;
alter table public.subscriptions add constraint subscriptions_billing_plan_name_check
  check (plan_name is null or plan_name in ('free','pilot','starter','growth','agency')) not valid;
alter table public.subscriptions drop constraint if exists subscriptions_billing_status_check;
alter table public.subscriptions add constraint subscriptions_billing_status_check
  check (status in ('on_trial','active','paused','past_due','unpaid','cancelled','expired','on_hold','pending')) not valid;

create index if not exists subscriptions_user_provider_updated_idx
  on public.subscriptions(user_id, billing_provider, updated_at desc);
create unique index if not exists subscriptions_dodo_subscription_id_key
  on public.subscriptions(id) where billing_provider = 'dodo';

create or replace function public.apply_dodo_billing_event(
  p_hash text, p_event_name text, p_payload jsonb, p_record jsonb default null
) returns text
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_event_id uuid;
  v_id text;
  v_owner text;
  v_time timestamptz;
  v_existing public.subscriptions%rowtype;
  v_status text;
begin
  if p_hash !~ '^[a-f0-9]{64}$' or p_event_name is null or p_payload is null then
    raise exception 'Invalid Dodo billing event';
  end if;
  insert into public.billing_webhook_events(event_hash, event_name, payload)
  values (p_hash, p_event_name, p_payload)
  on conflict (event_hash) do nothing returning id into v_event_id;
  if v_event_id is null then return 'duplicate'; end if;
  if p_record is null then return 'processed'; end if;

  v_id := nullif(p_record ->> 'id', '');
  v_owner := nullif(p_record ->> 'user_id', '');
  v_time := (p_record ->> 'provider_updated_at')::timestamptz;
  v_status := p_record ->> 'status';
  if v_id is null or v_owner is null or v_time is null
     or (p_record ->> 'billing_provider') <> 'dodo'
     or (p_record ->> 'plan_name') not in ('pilot','growth','agency')
     or v_status not in ('active','paused','past_due','unpaid','cancelled','expired','on_hold','pending') then
    raise exception 'Invalid Dodo subscription state';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_id));
  select * into v_existing from public.subscriptions where id = v_id for update;
  if found then
    if v_existing.plan = 'pro_beta' or v_existing.billing_provider <> 'dodo' or v_owner <> v_existing.user_id then
      raise exception 'Dodo subscription owner/provider mismatch';
    end if;
    if v_existing.provider_updated_at > v_time then return 'ignored'; end if;
  end if;

  insert into public.subscriptions (
    id,user_id,store_id,product_id,variant_id,customer_id,order_id,
    lemonsqueezy_customer_id,lemonsqueezy_subscription_id,lemonsqueezy_order_id,
    plan,plan_name,status,test_mode,renews_at,ends_at,trial_ends_at,
    customer_portal_url,update_payment_method_url,cancelled,provider_updated_at,email,billing_provider,updated_at
  ) values (
    v_id,v_owner,p_record->>'store_id',p_record->>'product_id',p_record->>'variant_id',
    nullif(p_record->>'customer_id',''),nullif(p_record->>'order_id',''),
    null,null,null,p_record->>'plan',p_record->>'plan_name',v_status,
    coalesce((p_record->>'test_mode')::boolean,false),
    nullif(p_record->>'renews_at','')::timestamptz,nullif(p_record->>'ends_at','')::timestamptz,
    null,null,null,coalesce((p_record->>'cancelled')::boolean,false),v_time,
    nullif(p_record->>'email',''),'dodo',now()
  ) on conflict (id) do update set
    store_id=excluded.store_id,product_id=excluded.product_id,variant_id=excluded.variant_id,
    customer_id=excluded.customer_id,order_id=excluded.order_id,plan=excluded.plan,
    plan_name=excluded.plan_name,status=excluded.status,test_mode=excluded.test_mode,
    renews_at=excluded.renews_at,ends_at=excluded.ends_at,cancelled=excluded.cancelled,
    provider_updated_at=excluded.provider_updated_at,email=coalesce(excluded.email,public.subscriptions.email),updated_at=now();
  return 'processed';
end;
$$;
revoke all on function public.apply_dodo_billing_event(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_dodo_billing_event(text,text,jsonb,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
