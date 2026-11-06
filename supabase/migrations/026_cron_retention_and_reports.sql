-- Additive cron schedules for the Next.js retention and report workers.
-- Configure pg_cron, pg_net, and the Vault secrets app_base_url and cron_secret first.
-- The job commands read Vault at invocation time so no credential is stored in cron.job.
begin;

alter table public.scheduled_reports
  add column if not exists recurrence_interval text not null default 'one_time'
    check (recurrence_interval in ('one_time', 'weekly', 'biweekly', 'monthly'));

do $cron_setup$
declare
  app_base_url text;
  cron_secret text;
begin
  -- Local PGlite migration checks do not provide Supabase-managed extensions.
  -- On Supabase, these objects must exist for schedules to be installed.
  if to_regclass('cron.job') is null
     or to_regclass('net.http_request_queue') is null
     or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Skipping retention/report cron registration: pg_cron, pg_net, or Vault is unavailable.';
    return;
  end if;

  select decrypted_secret into app_base_url
  from vault.decrypted_secrets
  where name = 'app_base_url'
  limit 1;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  limit 1;

  if app_base_url is null or app_base_url !~ '^https://' then
    raise exception 'Create Vault secret app_base_url with the deployed HTTPS application origin.';
  end if;
  if cron_secret is null or length(cron_secret) < 16 then
    raise exception 'Create Vault secret cron_secret with the deployed CRON_SECRET value (at least 16 characters).';
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('citemend-data-retention', 'citemend-scheduled-reports');

  perform cron.schedule(
    'citemend-data-retention',
    '0 2 * * *',
    $retention_job$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url' limit 1), '/') || '/api/cron/data-retention',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    $retention_job$
  );

  perform cron.schedule(
    'citemend-scheduled-reports',
    '0 4 * * *',
    $reports_job$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url' limit 1), '/') || '/api/cron/scheduled-reports',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    $reports_job$
  );
end;
$cron_setup$;

commit;
