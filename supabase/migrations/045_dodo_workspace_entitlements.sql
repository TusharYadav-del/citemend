begin;

alter table public.subscriptions add column if not exists workspace_id text;

-- Existing Dodo purchases predate workspace metadata and belong to the buyer's
-- single-user workspace until a new workspace-specific checkout is completed.
update public.subscriptions
set workspace_id = user_id
where billing_provider = 'dodo' and workspace_id is null;

create index if not exists subscriptions_workspace_provider_updated_idx
  on public.subscriptions(workspace_id, billing_provider, updated_at desc);

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
  v_workspace text;
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
  v_workspace := nullif(p_record ->> 'workspace_id', '');
  v_time := (p_record ->> 'provider_updated_at')::timestamptz;
  v_status := p_record ->> 'status';
  if v_id is null or v_owner is null or v_workspace is null or v_time is null
     or v_workspace !~ '^(user|org)_[A-Za-z0-9]+$'
     or (p_record ->> 'billing_provider') <> 'dodo'
     or (p_record ->> 'plan_name') not in ('pilot','growth','agency')
     or v_status not in ('active','paused','past_due','unpaid','cancelled','expired','on_hold','pending') then
    raise exception 'Invalid Dodo subscription state';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_id));
  select * into v_existing from public.subscriptions where id = v_id for update;
  if found then
    if v_existing.plan = 'pro_beta' or v_existing.billing_provider <> 'dodo' or v_owner <> v_existing.user_id
       or coalesce(v_existing.workspace_id, v_existing.user_id) <> v_workspace then
      raise exception 'Dodo subscription owner/workspace/provider mismatch';
    end if;
    if v_existing.provider_updated_at > v_time then return 'ignored'; end if;
  end if;

  insert into public.subscriptions (
    id,user_id,workspace_id,store_id,product_id,variant_id,customer_id,order_id,
    lemonsqueezy_customer_id,lemonsqueezy_subscription_id,lemonsqueezy_order_id,
    plan,plan_name,status,test_mode,renews_at,ends_at,trial_ends_at,
    customer_portal_url,update_payment_method_url,cancelled,provider_updated_at,email,billing_provider,updated_at
  ) values (
    v_id,v_owner,v_workspace,p_record->>'store_id',p_record->>'product_id',p_record->>'variant_id',
    nullif(p_record->>'customer_id',''),nullif(p_record->>'order_id',''),
    null,null,null,p_record->>'plan',p_record->>'plan_name',v_status,
    coalesce((p_record->>'test_mode')::boolean,false),
    nullif(p_record->>'renews_at','')::timestamptz,nullif(p_record->>'ends_at','')::timestamptz,
    null,null,null,coalesce((p_record->>'cancelled')::boolean,false),v_time,
    nullif(p_record->>'email',''),'dodo',now()
  ) on conflict (id) do update set
    workspace_id=excluded.workspace_id,store_id=excluded.store_id,product_id=excluded.product_id,variant_id=excluded.variant_id,
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
