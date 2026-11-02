# Day 28: Batch 1 retro and Phase 2 handoff

Reviewed on November 2, 2026 (Asia/Kolkata). Scope: launch stabilization and
handoff only. No Phase 2 features were started.

## Launch evidence and its limits

- Vercel CLI queried production CDN requests for the preceding 12 hours:
  20 records, 16 HTTP 200 and four HTTP 307, no further page and no excluded
  intervals. Most requests were static assets. These records are requests,
  not unique visitors, conversions, or proof of a public launch.
- The default 30-minute production error/fatal runtime-log query returned
  zero records. Three-day and one-hour runtime queries exceeded Hobby
  retention; the three-day CDN query required an upgraded entitlement.
  This cannot establish that the whole launch weekend had no errors.
- Vercel Web Analytics visitor/referrer data was not accessible. No Analytics
  package or Sentry integration was found in the repository, and no exported
  launch errors or customer bug reports were supplied. Browser automation
  failed to initialize because of the local sandbox helper. Dashboard UI
  review remains unverified; the CLI/API checks below are the available evidence.
- Supabase read-only REST checks returned HTTP 200: 11 audits created since
  October 30 at 00:00 UTC, zero recent unfinished audits with pending,
  free_pending, or free_saving status, and zero recent weekly runs. Counts
  include existing verification activity and do not establish customer usage.
  No rows were modified. Server logs require dashboard access or a management
  access token, which was not configured; application REST access is not log access.
- Lemon Squeezy read-only store-scoped API checks returned HTTP 200 with zero
  orders and zero subscriptions, with no additional pages. No checkout,
  payment, webhook configuration, or customer email was created.
- Public production probes: homepage and audit setup GET returned HTTP 200;
  anonymous dashboard returned HTTP 404, consistent with the previously
  documented Clerk development-key protection limitation. Invalid public
  reports use a streamed page shell (HTTP 200); UUID validation prevents a
  database lookup, as covered by existing tests. No report-routing rewrite
  was justified by the available evidence.

## Stabilization change

Code review found that POST /api/preview read the complete request body before
checking its size, with body-read failures outside error handling. A disconnected
upload could reject the handler and a stalled upload could wait indefinitely.
This was reproduced with controlled request streams; it was not identified in
historical production logs.

The preview now limits incoming bodies to 500 bytes while streaming, cancels
oversized uploads, rejects invalid UTF-8, and returns JSON HTTP 400 for interrupted
uploads or HTTP 408 after a five-second body-read deadline. Existing domain
validation, read-only checks, network budgets, and response shape are retained.
Cancellation does not wait for an unresponsive underlying source.

Regression coverage includes interrupted, oversized, stalled, malformed UTF-8,
and multibyte bodies, plus existing successful previews and network failures.

## Verification

- All 103 root unit/integration tests passed, including seven preview tests.
- npm run lint: passed with zero errors.
- npm run build: passed, including TypeScript and all 16 static pages, with zero errors. Turbopack reported a filesystem-cache reset warning; compilation completed successfully.
- npm run test:ui: could not run assertions because the local development server failed to respond before Playwright's 120-second startup deadline. This is an unverified browser check, not a passing suite. The 103 unit/integration tests and production build completed successfully.

## Four-week retro and transition

Batch 1 now includes the citation pipeline, authenticated owner workspaces,
public reports, free/Pro gating, checkout and signed billing webhooks, weekly
scan and email infrastructure, redirect publication and the Cloudflare Worker,
a production site, and a launch kit. Completing this implementation sprint is
a milestone; paid conversion and reliable scheduled delivery still need live evidence.

Before expanding Phase 2, carry forward the existing activation checks: production
Clerk keys and invited/non-invited beta sign-in; production billing webhook and
app-origin verification; deployed weekly relay, secrets, and scheduler; verified
Resend sender and a real eligible Pro scan/digest; verified domain control before
attaching the Worker route. The Product Hunt draft and full dashboard traffic/log
review also remain unverified. These are handoff items, not changes implemented
by Day 28. Day 27 is absent from PLAN.md; this review does not invent its completion.

For the next authorized review, open the citemend project in Vercel and inspect
Analytics and Observability with an explicit launch time range; open the linked
Supabase project's Logs Explorer and filter API/Postgres failures to that range;
open the configured Lemon Squeezy store and review orders, subscriptions, and
webhook deliveries, checking test/live mode. Export redacted failures for
reproduction when the dashboards' retained history is insufficient.
