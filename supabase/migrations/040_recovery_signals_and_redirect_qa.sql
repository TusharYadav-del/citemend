begin;

alter table public.ai_404_events
  add column if not exists referrer_host text not null default '';

alter table public.recovery_findings
  add column if not exists qa_checked_at timestamptz,
  add column if not exists qa_status text,
  add column if not exists qa_old_url_status integer,
  add column if not exists qa_destination_status integer,
  add column if not exists qa_detail text;

alter table public.recovery_findings
  drop constraint if exists recovery_findings_qa_status_check;
alter table public.recovery_findings
  add constraint recovery_findings_qa_status_check
  check (qa_status is null or qa_status in ('healthy','source_not_redirecting','redirect_chain_or_loop','destination_not_200','check_unavailable'));
alter table public.recovery_findings
  drop constraint if exists recovery_findings_qa_http_status_check;
alter table public.recovery_findings
  add constraint recovery_findings_qa_http_status_check
  check ((qa_old_url_status is null or qa_old_url_status between 100 and 599)
     and (qa_destination_status is null or qa_destination_status between 100 and 599));

alter table public.redirect_rules
  add column if not exists qa_checked_at timestamptz,
  add column if not exists qa_status text,
  add column if not exists qa_old_url_status integer,
  add column if not exists qa_destination_status integer,
  add column if not exists qa_detail text;
alter table public.redirect_rules
  drop constraint if exists redirect_rules_qa_status_check;
alter table public.redirect_rules
  add constraint redirect_rules_qa_status_check
  check (qa_status is null or qa_status in ('healthy','source_not_redirecting','redirect_chain_or_loop','destination_not_200','check_unavailable'));
alter table public.redirect_rules
  drop constraint if exists redirect_rules_qa_http_status_check;
alter table public.redirect_rules
  add constraint redirect_rules_qa_http_status_check
  check ((qa_old_url_status is null or qa_old_url_status between 100 and 599)
     and (qa_destination_status is null or qa_destination_status between 100 and 599));

create index if not exists recovery_findings_qa_due_idx
  on public.recovery_findings(approval_status, qa_checked_at asc nulls first, created_at asc)
  where finding_type = 'dead_url' and approval_status = 'deployed';
create index if not exists redirect_rules_qa_due_idx
  on public.redirect_rules(qa_checked_at asc nulls first, created_at asc)
  where is_active = true and synced_to_cms = true and shopify_redirect_id is not null;

create or replace function public.record_recovery_signal(
  target_domain text,
  target_path text,
  target_referrer_host text default null,
  target_redirected_to text default null,
  target_user_agent text default ''
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_audit_id uuid;
  v_finding_id uuid;
  v_evidence jsonb;
  v_visits integer;
  v_referrers integer;
  v_citations integer;
  v_priority integer;
  v_normalized_path text;
  v_ai_referrer text := '';
begin
  if target_domain is null or length(target_domain) > 253 or target_domain <> lower(target_domain)
     or target_domain !~ '^[a-z0-9.-]+$' or position('..' in target_domain) > 0
     or target_path is null or length(target_path) > 2048 or left(target_path, 1) <> '/'
     or target_path like '//%' or target_path ~ '[?#]' or target_path ~ '[[:cntrl:]]' or strpos(target_path, chr(92)) > 0
     or target_user_agent is null or length(target_user_agent) > 1024 then
    return jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;
  if target_referrer_host is not null and (length(target_referrer_host) > 253 or target_referrer_host <> lower(target_referrer_host)
     or target_referrer_host !~ '^[a-z0-9.-]+$' or position('..' in target_referrer_host) > 0) then
    return jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;
  if not public.claim_pixel_intercept_quota(target_domain) then
    return jsonb_build_object('accepted', false, 'reason', 'rate_limited_or_unknown_domain');
  end if;
  v_normalized_path := lower(regexp_replace(target_path, '/+$', ''));
  if v_normalized_path = '' then v_normalized_path := '/'; end if;

  select id into v_audit_id
  from public.audits
  where domain = target_domain and status in ('completed','partial')
  order by created_at desc
  limit 1;
  if v_audit_id is null then return jsonb_build_object('accepted', false, 'reason', 'unknown_domain'); end if;

  if target_referrer_host <> target_domain and target_referrer_host is not null then
    if target_referrer_host = any(array['chatgpt.com','openai.com','perplexity.ai','claude.ai','gemini.google.com','copilot.microsoft.com','bing.com'])
       or target_referrer_host like '%.openai.com' or target_referrer_host like '%.perplexity.ai'
       or target_referrer_host like '%.claude.ai' or target_referrer_host like '%.gemini.google.com'
       or target_referrer_host like '%.copilot.microsoft.com' then
      v_ai_referrer := target_referrer_host;
    end if;
  end if;

  insert into public.ai_404_events(domain, broken_path, ai_referrer, redirected_to, user_agent, referrer_host)
  values (target_domain, target_path, v_ai_referrer, target_redirected_to, target_user_agent, coalesce(target_referrer_host, ''));

  select id, signal_evidence into v_finding_id, v_evidence
  from public.recovery_findings
  where audit_id = v_audit_id and domain = target_domain and normalized_path = v_normalized_path
    and finding_type = 'dead_url'
  order by created_at desc
  limit 1
  for update;

  if v_finding_id is null then
    v_visits := 1;
    v_referrers := case when target_referrer_host is not null and target_referrer_host <> target_domain then 1 else 0 end;
    v_citations := 0;
    v_priority := round(least(100, least(35, 10 * ln(v_visits + 1) / ln(2.0)) + least(20, case when v_referrers > 0 then 20 else 0 end) + 20 * case when lower(target_path) ~ '^/(products|collections|pricing|policies)(/|$)' then 1 else 0 end))::integer;
    insert into public.recovery_findings(audit_id, domain, finding_type, normalized_path, signal_evidence,
      guardrail_classification, approval_status, suggested_target_url, confidence_score, match_reason)
    values (v_audit_id, target_domain, 'dead_url', v_normalized_path,
      jsonb_build_object('observed_404_visits',v_visits,'external_referrers',v_referrers,'citation_snapshots',v_citations,
        'user_agent_verified',false,'priority_score',v_priority,'url_variants',jsonb_build_array(target_path)),
      'leave_as_404_or_410','pending_human_review',null,null,
      'Reported by the site event collector; HTTP 404 status and destination equivalence require verification.')
    on conflict (audit_id, normalized_path, finding_type) do nothing
    returning id into v_finding_id;
  end if;

  if v_finding_id is null then
    select id, signal_evidence into v_finding_id, v_evidence
    from public.recovery_findings
    where audit_id = v_audit_id and domain = target_domain and normalized_path = v_normalized_path
      and finding_type = 'dead_url'
    limit 1
    for update;
  end if;

  if v_evidence is not null then
    v_visits := greatest(0, coalesce((v_evidence->>'observed_404_visits')::integer, 0)) + 1;
    v_referrers := greatest(0, coalesce((v_evidence->>'external_referrers')::integer, 0))
      + case when target_referrer_host is not null and target_referrer_host <> target_domain then 1 else 0 end;
    v_citations := greatest(0, coalesce((v_evidence->>'citation_snapshots')::integer, 0));
    v_priority := round(least(100,
      least(35, 10 * ln(v_visits + 1) / ln(2.0))
      + least(20, case when v_referrers > 0 then 20 else 0 end)
      + least(25, 8 * ln(v_citations + 1) / ln(2.0))
      + case when lower(target_path) ~ '^/(products|collections|pricing|policies)(/|$)' then 20 else 0 end
    ))::integer;
    update public.recovery_findings
    set signal_evidence = coalesce(v_evidence, '{}'::jsonb) || jsonb_build_object(
      'observed_404_visits',v_visits,'external_referrers',v_referrers,'citation_snapshots',v_citations,
      'user_agent_verified',false,'priority_score',v_priority
    )
    where id = v_finding_id;
  end if;
  return jsonb_build_object('accepted', true, 'finding_id', v_finding_id, 'priority_score', coalesce(v_priority,0));
end;
$$;

revoke all on function public.record_recovery_signal(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_recovery_signal(text,text,text,text,text) to service_role;

notify pgrst, 'reload schema';
commit;
