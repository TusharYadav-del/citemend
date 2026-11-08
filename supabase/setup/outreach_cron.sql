-- Apply after configuring Supabase Vault secrets `app_base_url` and `cron_secret`.
-- Safe to rerun; this schedules one daily call through pg_net.
do $$
declare app_url text; cron_secret text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name='app_base_url' limit 1;
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name='cron_secret' limit 1;
  if app_url is null or cron_secret is null then
    raise exception 'Configure app_base_url and cron_secret in Supabase Vault before scheduling outreach.';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname='citemend-outreach-daily';
  perform cron.schedule('citemend-outreach-daily','0 9 * * *',format(
    $job$select net.http_post(url := %L, headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'), body := '{}'::jsonb);$job$,
    rtrim(app_url,'/')||'/api/cron/outreach/daily','Bearer '||cron_secret
  ));
end $$;
