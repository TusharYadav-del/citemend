begin;
create table public.audit_citation_gaps (
  audit_id uuid primary key references public.audits(id) on delete cascade,
  user_id text not null,
  domain text not null,
  buyer_prompt text not null,
  provider text not null,
  competitor_urls jsonb not null check (jsonb_typeof(competitor_urls) = 'array' and jsonb_array_length(competitor_urls) between 1 and 5),
  created_at timestamptz not null default now()
);
create index audit_citation_gaps_owner_idx on public.audit_citation_gaps(user_id);
alter table public.audit_citation_gaps enable row level security;
revoke all on public.audit_citation_gaps from anon, authenticated;
grant all on public.audit_citation_gaps to service_role;
comment on table public.audit_citation_gaps is 'Private owner-scoped citation-gap evidence. URLs occur in generated answer text; search-only sources do not establish a gap.';
notify pgrst, 'reload schema';
commit;
