begin;

alter table public.audits
  add column if not exists user_id text;

create index if not exists audits_user_id_created_at_idx
  on public.audits (user_id, created_at desc)
  where user_id is not null;

comment on column public.audits.user_id is
  'Clerk user ID that owns this audit; null only for records created before user ownership was added.';

commit;