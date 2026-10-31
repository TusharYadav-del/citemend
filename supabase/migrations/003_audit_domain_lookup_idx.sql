begin;

-- Domain-scoped report and metrics queries can seek to the newest audit
-- for a hostname without scanning the full audits table.
create index if not exists audits_domain_created_at_idx
  on public.audits (domain, created_at desc);

comment on index public.audits_domain_created_at_idx is
  'Supports domain-scoped audit lookups and newest-first ordering.';

commit;
