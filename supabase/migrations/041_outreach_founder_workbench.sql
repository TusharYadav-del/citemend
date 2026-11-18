begin;

alter table public.outreach_emails
  add column if not exists founder_review_decision text,
  add column if not exists founder_reviewed_at timestamptz,
  add column if not exists founder_reviewed_by text;

alter table public.outreach_emails
  drop constraint if exists outreach_emails_founder_review_decision_check;
alter table public.outreach_emails
  add constraint outreach_emails_founder_review_decision_check
  check (founder_review_decision is null or founder_review_decision in ('approved','rejected'));

alter table public.outreach_emails
  drop constraint if exists outreach_emails_founder_review_fields_check;
alter table public.outreach_emails
  add constraint outreach_emails_founder_review_fields_check
  check ((founder_review_decision is null and founder_reviewed_at is null and founder_reviewed_by is null)
      or (founder_review_decision is not null and founder_reviewed_at is not null and founder_reviewed_by is not null));

alter table public.outreach_emails
  drop constraint if exists outreach_emails_founder_review_status_check;
alter table public.outreach_emails
  add constraint outreach_emails_founder_review_status_check
  check (founder_review_decision is null
      or (founder_review_decision = 'approved' and status in ('draft','unsubscribed'))
      or (founder_review_decision = 'rejected' and status in ('draft_rejected','unsubscribed')));

alter table public.outreach_emails
  drop constraint if exists outreach_emails_status_check;
alter table public.outreach_emails
  add constraint outreach_emails_status_check
  check (status in ('draft','draft_locked','draft_rejected','queued','sent','delivered','bounced','complained','failed','unsubscribed'));

create index if not exists outreach_emails_founder_review_idx
  on public.outreach_emails(status, created_at desc)
  where status in ('draft_locked','draft','draft_rejected');

alter table public.outreach_settings
  add column if not exists deliverability_domain text,
  add column if not exists deliverability_checklist jsonb not null default '{"provider_domain_verified":false,"spf_aligned":false,"dkim_verified":false,"dmarc_published":false,"from_address_aligned":false,"reply_mailbox_monitored":false,"unsubscribe_tested":false,"suppression_ledger_reviewed":false}'::jsonb,
  add column if not exists deliverability_checked_at timestamptz;

alter table public.outreach_settings
  drop constraint if exists outreach_settings_deliverability_checklist_object_check;
alter table public.outreach_settings
  add constraint outreach_settings_deliverability_checklist_object_check
  check (jsonb_typeof(deliverability_checklist) = 'object');

commit;
