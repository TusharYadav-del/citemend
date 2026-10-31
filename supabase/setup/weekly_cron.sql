-- Run only after migration 005, pg_cron, pg_net, Vault secrets, and the
-- deployed weekly-scan Edge Function are ready. No secrets belong in this file.
-- Required Vault secret names: weekly_scan_edge_url, weekly_scan_cron_secret.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'weekly_scan_edge_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'weekly_scan_cron_secret') then
    raise exception 'Create weekly_scan_edge_url and weekly_scan_cron_secret in Vault first.';
  end if;
end
$$;

-- Every five minutes, start this week's run after Monday 09:00 Asia/Kolkata,
-- or drain existing unfinished work. No network call is made when idle.
select cron.schedule(
  'citemend-weekly-scan',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'weekly_scan_edge_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'weekly_scan_cron_secret' limit 1)
      ),
      body := jsonb_build_object(
        'action', case
          when not exists (
            select 1 from public.weekly_scan_runs
            where week_start = date_trunc('week', now() at time zone 'Asia/Kolkata')::date
          ) then 'start'
          else 'drain'
        end
      ),
      timeout_milliseconds := 20000
    )
    where not (
      extract(isodow from now() at time zone 'Asia/Kolkata') = 1
      and (now() at time zone 'Asia/Kolkata')::time < time '09:00'
    )
    and (
      not exists (
        select 1 from public.weekly_scan_runs
        where week_start = date_trunc('week', now() at time zone 'Asia/Kolkata')::date
      )
      or exists (select 1 from public.weekly_scan_runs where status in ('initializing', 'running'))
    );
  $job$
);
