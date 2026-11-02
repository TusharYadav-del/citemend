begin;

alter table public.redirect_rules
  add column if not exists synced_to_cms boolean not null default false;

comment on column public.redirect_rules.synced_to_cms is
  'True after this approved redirect has been created in the connected CMS platform.';

commit;
