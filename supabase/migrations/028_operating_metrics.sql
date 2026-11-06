begin;

alter table public.audits
  add column if not exists completed_at timestamptz;

create table if not exists public.workspace_operating_metrics (
  user_id text not null,
  workspace_domain text not null,
  workspace_created_at timestamptz not null,
  baseline_method text not null default 'first_valid_audit_submission'
    check (baseline_method in ('first_valid_audit_submission','legacy_baseline')),
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_domain)
);
create index if not exists workspace_operating_metrics_created_idx
  on public.workspace_operating_metrics(workspace_created_at desc);

alter table public.workspace_operating_metrics enable row level security;
revoke all on public.workspace_operating_metrics from public, anon, authenticated;
grant all on public.workspace_operating_metrics to service_role;

create index if not exists audits_owner_domain_completed_idx
  on public.audits(user_id, domain, completed_at desc)
  where completed_at is not null;

commit;
