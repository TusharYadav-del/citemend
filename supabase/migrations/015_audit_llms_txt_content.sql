begin;

alter table public.audits
  add column if not exists llms_txt_content text;

commit;
