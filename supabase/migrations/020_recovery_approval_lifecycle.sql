begin;

alter table public.broken_links
  add column if not exists url_state text not null default 'unknown',
  add column if not exists approval_status text not null default 'pending_review',
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists previous_destination_url text,
  add column if not exists deployed_at timestamptz,
  add column if not exists rolled_back_at timestamptz,
  add column if not exists match_evidence_reason text,
  add column if not exists match_confidence numeric(5,2),
  add constraint broken_links_url_state_check check (url_state in ('hallucinated','404','410','301','200','blocked','timeout','unknown')),
  add constraint broken_links_approval_status_check check (approval_status in ('pending_review','approved','deployed','rolled_back','rejected')),
  add constraint broken_links_match_confidence_check check (match_confidence is null or match_confidence between 0 and 100);

update public.broken_links
set url_state = case http_status
  when 404 then '404'
  when 410 then '410'
  when 301 then '301'
  when 200 then '200'
  else 'unknown'
end,
match_evidence_reason = case
  when suggested_redirect is null then 'manual_mapping_required: this legacy row has no saved destination candidate.'
  else 'Legacy destination candidate; preview and explicit human review are required.'
end
where url_state = 'unknown';

alter table public.redirect_rules
  add column if not exists shopify_redirect_id text;

create index if not exists broken_links_approval_review_idx
  on public.broken_links (approval_status, created_at desc);

create or replace function public.redirect_source_approved(source_link uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.broken_links link
    where link.id = source_link
      and link.http_status = 404
      and link.url_state = '404'
      and link.approval_status in ('approved', 'deployed')
      and link.match_confidence >= 70
  );
$$;

revoke all on function public.redirect_source_approved(uuid) from public, anon, authenticated;
grant execute on function public.redirect_source_approved(uuid) to anon, authenticated, service_role;

drop policy if exists "Public may read active redirect targets" on public.redirect_rules;
create policy "Public may read approved active redirect targets"
  on public.redirect_rules for select to anon
  using (active = true and source_link_id is not null and public.redirect_source_approved(source_link_id));

notify pgrst, 'reload schema';
commit;
