begin;

alter table public.audits
  add column if not exists webhook_url text;

comment on column public.audits.webhook_url is
  'Server-only Slack or Discord incoming webhook URL for pixel recovery alerts. Never return this value to clients.';

commit;
