begin;

alter table public.broken_links
  add column if not exists link_health_json jsonb,
  add column if not exists wayback_snapshot_json jsonb;

alter table public.citation_hijack_opportunities
  add column if not exists source_page_url text,
  add column if not exists failed_destination_url_key text,
  add column if not exists replacement_snippet text,
  add column if not exists wayback_snapshot_json jsonb;

create index if not exists citation_hijack_failed_destination_idx
  on public.citation_hijack_opportunities(audit_id, failed_destination_url_key)
  where failed_destination_url_key is not null;

create index if not exists citation_hijack_source_page_idx
  on public.citation_hijack_opportunities(audit_id, source_page_url)
  where source_page_url is not null;

commit;
