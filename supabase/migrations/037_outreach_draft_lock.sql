begin;

alter table public.outreach_emails
  drop constraint if exists outreach_emails_status_check;

alter table public.outreach_emails
  add constraint outreach_emails_status_check
  check (status in ('draft', 'draft_locked', 'queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'unsubscribed'));

commit;
