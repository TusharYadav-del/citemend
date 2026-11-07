-- Migration 018 is already occupied by secure batch integrations. Keep the
-- deployed migration history immutable and add the queue with the next number.
begin;

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workspace_domain text not null,
  job_type text not null check (job_type in ('audit_scan','audit_enrichment','listicle_crawl','ecommerce_sync')),
  job_key text not null check (length(job_key) between 1 and 160),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','retrying')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  current_step_label text not null default 'Queued',
  payload_json jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_json) = 'object'),
  result_json jsonb check (result_json is null or jsonb_typeof(result_json) = 'object'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  continuation_pending boolean not null default false,
  next_retry_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, workspace_domain, job_key)
);
create index if not exists background_jobs_dispatch_idx
  on public.background_jobs(status,next_retry_at,created_at)
  where status in ('queued','retrying','running');
create index if not exists background_jobs_tenant_created_idx
  on public.background_jobs(user_id,workspace_domain,created_at desc);
alter table public.background_jobs enable row level security;
revoke all on public.background_jobs from public,anon,authenticated;
grant all on public.background_jobs to service_role;

-- Serialize enqueue decisions per tenant so idempotency, queue-depth, and
-- per-minute limits remain atomic even when the browser retries concurrently.
create or replace function public.enqueue_background_job(
  p_user_id text,p_workspace_domain text,p_job_type text,p_job_key text,p_payload_json jsonb
) returns setof public.background_jobs
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare existing public.background_jobs%rowtype; created public.background_jobs%rowtype;
begin
  if p_user_id is null or length(p_user_id) not between 1 and 256
     or p_workspace_domain is null or length(p_workspace_domain) not between 1 and 253
     or p_job_type not in ('audit_scan','audit_enrichment','listicle_crawl','ecommerce_sync')
     or p_job_key is null or length(p_job_key) not between 1 and 160
     or p_payload_json is null or jsonb_typeof(p_payload_json) <> 'object' then
    raise exception 'Invalid background job request.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id),hashtext(p_workspace_domain));
  select * into existing from public.background_jobs
    where user_id=p_user_id and workspace_domain=p_workspace_domain and job_key=p_job_key;
  if found then return next existing; return; end if;
  if (select count(*) from public.background_jobs
      where user_id=p_user_id and workspace_domain=p_workspace_domain
        and status in ('queued','running','retrying')) >= 10 then
    raise exception 'Workspace background queue is full.' using errcode='P0001';
  end if;
  if (select count(*) from public.background_jobs
      where user_id=p_user_id and workspace_domain=p_workspace_domain
        and created_at >= now()-interval '1 minute') >= 20 then
    raise exception 'Workspace background job rate limit reached.' using errcode='P0001';
  end if;
  insert into public.background_jobs(user_id,workspace_domain,job_type,job_key,payload_json)
    values(p_user_id,p_workspace_domain,p_job_type,p_job_key,p_payload_json)
    returning * into created;
  return next created;
end;
$$;

create or replace function public.claim_background_job(p_lease_seconds integer default 240)
returns setof public.background_jobs
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  -- Serialize short claims so two cron invocations cannot start sibling jobs
  -- for the same workspace from the same statement snapshot.
  perform pg_advisory_xact_lock(829391,1);
  update public.background_jobs
    set status='failed',current_step_label='Failed after expired worker lease',
        error_message='Worker lease expired after the maximum attempts.',
        completed_at=now(),updated_at=now(),lease_token=null,lease_expires_at=null
  where status='running' and lease_expires_at < now() and attempt_count >= max_attempts;

  return query
  with candidate as (
    select pending.id from public.background_jobs pending
    where pending.attempt_count < pending.max_attempts and (
      (pending.status in ('queued','retrying') and pending.next_retry_at <= now()) or
      (pending.status='running' and pending.lease_expires_at < now())
    )
    and not exists (
      select 1 from public.background_jobs active
      where active.user_id=pending.user_id and active.workspace_domain=pending.workspace_domain
        and active.status='running' and active.lease_expires_at >= now()
    )
    order by pending.next_retry_at,pending.created_at
    for update skip locked
    limit 1
  )
  update public.background_jobs j
    set status='running',attempt_count=case when j.continuation_pending then j.attempt_count else j.attempt_count+1 end,
        continuation_pending=false,
        current_step_label=case when j.status='running' then 'Resuming after worker lease expiry' else 'Starting' end,
        lease_token=gen_random_uuid(),
        lease_expires_at=now()+make_interval(secs=>least(300,greatest(30,p_lease_seconds))),
        updated_at=now(),error_message=null
  from candidate where j.id=candidate.id
  returning j.*;
end;
$$;

create or replace function public.advance_background_job(
  p_job_id uuid,p_lease_token uuid,p_payload_json jsonb,p_progress_percent integer,p_step_label text
) returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare changed integer;
begin
  update public.background_jobs set status='queued',payload_json=p_payload_json,
    continuation_pending=true,
    progress_percent=greatest(progress_percent,least(99,greatest(0,p_progress_percent))),
    current_step_label=left(p_step_label,160),next_retry_at=now(),
    lease_token=null,lease_expires_at=null,updated_at=now()
  where id=p_job_id and status='running' and lease_token=p_lease_token;
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;

create or replace function public.report_background_job_progress(
  p_job_id uuid,p_lease_token uuid,p_progress_percent integer,p_step_label text,p_lease_seconds integer default 300
) returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare changed integer;
begin
  update public.background_jobs set progress_percent=greatest(progress_percent,least(99,greatest(0,p_progress_percent))),
    current_step_label=left(p_step_label,160),
    lease_expires_at=now()+make_interval(secs=>least(600,greatest(30,p_lease_seconds))),updated_at=now()
  where id=p_job_id and status='running' and lease_token=p_lease_token;
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;

create or replace function public.complete_background_job(
  p_job_id uuid,p_lease_token uuid,p_result_json jsonb
) returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare changed integer;
begin
  update public.background_jobs set status='completed',result_json=p_result_json,
    progress_percent=100,current_step_label='Completed',completed_at=now(),updated_at=now(),
    lease_token=null,lease_expires_at=null,error_message=null
  where id=p_job_id and status='running' and lease_token=p_lease_token;
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;

create or replace function public.retry_background_job(
  p_job_id uuid,p_lease_token uuid,p_safe_error text
) returns text language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare new_status text;
begin
  update public.background_jobs set
    status=case when attempt_count >= max_attempts then 'failed' else 'retrying' end,
    continuation_pending=false,
    current_step_label=case when attempt_count >= max_attempts then 'Failed' else 'Waiting to retry' end,
    error_message=left(p_safe_error,500),
    next_retry_at=case when attempt_count >= max_attempts then now()
      else now()+make_interval(secs=>least(3600,15*power(2,greatest(0,attempt_count-1))::integer)) end,
    completed_at=case when attempt_count >= max_attempts then now() else null end,
    lease_token=null,lease_expires_at=null,updated_at=now()
  where id=p_job_id and status='running' and lease_token=p_lease_token
  returning status into new_status;
  return new_status;
end;
$$;
revoke all on function public.claim_background_job(integer) from public,anon,authenticated;
revoke all on function public.enqueue_background_job(text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.advance_background_job(uuid,uuid,jsonb,integer,text) from public,anon,authenticated;
revoke all on function public.report_background_job_progress(uuid,uuid,integer,text,integer) from public,anon,authenticated;
revoke all on function public.complete_background_job(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.retry_background_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_background_job(integer) to service_role;
grant execute on function public.enqueue_background_job(text,text,text,text,jsonb) to service_role;
grant execute on function public.advance_background_job(uuid,uuid,jsonb,integer,text) to service_role;
grant execute on function public.report_background_job_progress(uuid,uuid,integer,text,integer) to service_role;
grant execute on function public.complete_background_job(uuid,uuid,jsonb) to service_role;
grant execute on function public.retry_background_job(uuid,uuid,text) to service_role;

create table if not exists public.founder_weekly_scorecards (
  founder_user_id text not null,
  week_start date not null,
  scorecard_json jsonb not null default '{}'::jsonb check (jsonb_typeof(scorecard_json)='object'),
  updated_at timestamptz not null default now(),
  primary key(founder_user_id,week_start)
);
alter table public.founder_weekly_scorecards enable row level security;
revoke all on public.founder_weekly_scorecards from public,anon,authenticated;
grant all on public.founder_weekly_scorecards to service_role;

create or replace function public.citemend_readiness_schema_status()
returns table(table_name text, table_exists boolean, rls_enabled boolean, policy_count integer)
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  with required(name) as (values
    ('audits'),('broken_links'),('subscriptions'),('weekly_scan_runs'),('weekly_scan_jobs'),('weekly_scan_digests'),
    ('redirect_rules'),('sitemap_pages'),('audit_citation_gaps'),('ai_404_events'),('citation_hijack_opportunities'),
    ('cms_connections'),('rescued_ai_visits'),('workspace_integrations'),('pixel_intercept_quotas'),('action_audit_logs'),
    ('ai_observation_evidence'),('recovery_outcomes'),('webhook_events_log'),('workspace_api_keys'),
    ('autonomous_agent_runs'),('ecommerce_catalog_items'),('organization_members'),('workspace_governance_policies'),
    ('scheduled_reports'),('citation_change_events'),('workspace_api_rate_windows'),('workspace_operating_metrics'),
    ('case_studies'),('design_partner_applications'),('agency_referrals'),('forensic_teaser_rate_windows'),
    ('background_jobs'),('founder_weekly_scorecards')
  )
  select required.name,c.oid is not null,coalesce(c.relrowsecurity,false),
    (select count(*)::integer from pg_catalog.pg_policy p where p.polrelid=c.oid)
  from required left join pg_catalog.pg_class c on c.relname=required.name and c.relkind in ('r','p')
  left join pg_catalog.pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where c.oid is null or n.oid is not null
$$;
revoke all on function public.citemend_readiness_schema_status() from public,anon,authenticated;
grant execute on function public.citemend_readiness_schema_status() to service_role;

notify pgrst,'reload schema';
commit;
