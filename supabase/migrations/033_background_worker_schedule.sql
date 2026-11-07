-- Run the background queue from Supabase pg_cron so Vercel Hobby plans can
-- retain their supported daily Cron jobs while the worker is polled each minute.
-- The job reads app_base_url and cron_secret from Vault on every invocation.
begin;

do $worker_schedule$
declare
  app_base_url text;
  cron_secret text;
begin
  if to_regclass('cron.job') is null
     or to_regclass('net.http_request_queue') is null
     or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Skipping background worker registration: pg_cron, pg_net, or Vault is unavailable.';
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
  where jobname = 'citemend-background-jobs';

  perform cron.schedule(
    'citemend-background-jobs',
    '* * * * *',
    $worker_job$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url' limit 1), '/') || '/api/cron/background-jobs',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    $worker_job$
  );
end;
$worker_schedule$;

commit;
