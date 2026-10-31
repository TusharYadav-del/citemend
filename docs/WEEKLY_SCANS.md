# Weekly Pro scans

The scheduler starts a weekly run on Monday at 09:00 Asia/Kolkata (03:30 UTC).
It queues each distinct domain from completed or partial audits owned by a
currently eligible Pro account. The worker rechecks Pro access before each
scan, runs the Gemini citation probe through the existing audit pipeline, and
stores a new owner-scoped audit with confirmed HTTP 404 findings.

New audits save their buyer prompt after migration 005, so weekly scans can
reuse the most recent prompt for each domain. Older audits have no saved
prompt and use the dashboard's standard prompt instead. Set the optional server-only
`WEEKLY_SCAN_PROMPT` to change the fallback prompt for older audits; it must be
between 1 and 4,000 characters. It cannot reconstruct past custom prompts.
Interactive audits continue to use Groq and Tavily.

## Activate after deployment

1. Enable **pg_cron** and **pg_net** in the Supabase dashboard. Apply
   `supabase/migrations/005_weekly_scans.sql` in the SQL Editor. The new run and
   job tables have row level security enabled and no public policies.
2. Deploy the Next.js app to Vercel. Configure its server environment with
   `CRON_SECRET`, `GEMINI_API_KEY`, the existing Supabase URL and server key,
   and optionally `WEEKLY_SCAN_PROMPT`. The ignored local `.env.local` contains
   a generated `CRON_SECRET` if none was already present. Copy secrets through
   the providers' secret settings; never commit them or send them in chat.
3. Deploy the `weekly-scan` Supabase Edge Function. Set its `CRON_SECRET`
   to the same value and `WEEKLY_SCAN_APP_URL` to the HTTPS origin of the
   deployed app. The function's gateway JWT check is disabled in
   `supabase/config.toml` because the relay verifies the bearer secret itself;
   the Next.js route verifies the same secret again.
4. In Supabase Vault, create secrets named `weekly_scan_edge_url` (the full
   URL of the deployed Edge Function) and `weekly_scan_cron_secret` (the same
   cron secret). For example, in a private SQL Editor session:

   ```sql
   select vault.create_secret('https://YOUR_PROJECT.supabase.co/functions/v1/weekly-scan', 'weekly_scan_edge_url');
   select vault.create_secret('YOUR_PRIVATE_CRON_SECRET', 'weekly_scan_cron_secret');
   ```

   Replace the placeholders locally. Check existing Vault names first and
   update an existing secret instead of creating duplicates. Supabase notes
   that decrypted request headers can be visible to database login roles
   while a pg_net request is queued; restrict those roles appropriately.
5. Run `supabase/setup/weekly_cron.sql` in the SQL Editor. It installs one
   named cron job that checks every five minutes. The first dispatch occurs at
   or after Monday 09:00 Asia/Kolkata; subsequent dispatches only drain
   unfinished work. No HTTP request is sent when all weekly work is finished.
6. Configure the deferred Lemon Squeezy production webhook and subscribe to
   `subscription_created`, `subscription_cancelled`, and
   `subscription_updated`. Without it, paid subscriptions cannot reliably
   activate Pro access or enter the weekly queue. Verify Gemini availability
   and a test-mode Pro account before relying on live scheduled scans. The most
   recent local Gemini probe returned HTTP 429, so resolve its quota or rate
   limit before activating the schedule.

The Edge relay returns after the Next.js route accepts the request. Next.js
uses `after()` to process up to two jobs in the background, with a configured
300-second route duration; ensure the hosting plan supports that duration.
The queue retries failed jobs up to three times and reclaims stale leases.
Each weekly job uses a stable audit UUID so a retry can recognize an already
saved report. If a run has terminal failures, it is marked `partial`.

## Inspect execution

In the Supabase SQL Editor, use these read-only queries:

```sql
select week_start, status, total_jobs, last_error, created_at, finished_at
from public.weekly_scan_runs order by week_start desc limit 10;

select run_id, status, count(*) from public.weekly_scan_jobs
group by run_id, status order by run_id, status;

select jobname, schedule, active from cron.job
where jobname = 'citemend-weekly-scan';
```

A successful cron dispatch only means the app accepted the request. Check the
run and job tables for actual scan completion and failures. Scheduled Gemini
search calls use your provider quota and may incur charges.
