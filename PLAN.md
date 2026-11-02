> **AGENT RULE:** Only build the single Day I ask for in chat. Do NOT touch completed days or start future days.

## Day 1: [Repository Setup & Environment Initialization] (COMPLETED - DO NOT TOUCH)
...

## Day 2: Supabase Database Schema Setup (COMPLETED)

- [x] Add the audits and broken_links SQL migration with UUID defaults, timestamps, and the audit foreign key.
- [x] Install @supabase/supabase-js and initialize the public client from environment variables.
- [x] Document local configuration and dashboard migration steps.
- [x] Verify lint and production build (both pass with zero errors).
- [x] Configure the citemend project URL and public key in ignored .env.local; the hosted API responds.
- [x] Run supabase/migrations/001_init.sql in the project's SQL Editor; both hosted table queries return HTTP 200 with all expected columns.
- [x] Commit and push the verified Day 2 schema and client to main.

Day 2 completed: hosted configuration and both table schemas verified. Row level security remains enabled; public row access awaits future ownership policies.
Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 3: Mock audit UI and Supabase integration (COMPLETED)

Scope revised by the user: skip live Gemini probes due to provider 503/429
responses. Use hardcoded mock citations and audit findings, finish the frontend
and Supabase integration, and reconnect live Gemini later.

- [x] Retain the server-only Google GenAI utility for future reconnection.
- [x] Add hardcoded mock JSON with citations, simulated 404s, and redirects.
- [x] Build the development audit UI with loading, empty, error, and saved states.
- [x] Implement server-only Supabase save/read-back with mock_completed status, foreign-key verification, and partial-save cleanup.
- [x] Verify mock generation through the Server Action without Gemini calls (3 citations and 2 simulated 404s).
- [x] Configure the server-only Supabase key and verify a hosted save/read-back: audit 66261939-1b0f-4eaa-84d5-5812350b8be1 saved with mock_completed status and two related broken-link rows.
- [x] Verify lint and production build with zero errors; homepage/API return 200 and production mock route returns 404. Mocked database tests verify save/read-back, cleanup, missing key, and production guard.
- [x] Save and push the revised Day 3 implementation; hosted persistence verification succeeded through the Server Action.

Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 4: Sitemap fetcher and HTTP status checker (COMPLETED)

- [x] Implement server-only lib/seo.ts using native fetch and fast-xml-parser.
- [x] Discover /sitemap.xml and robots.txt declarations, traverse sitemap indexes, decode XML/gzip, and deduplicate valid page URLs.
- [x] Implement HEAD/GET status checks with bounded redirects, timeouts, body cancellation, and explicit network errors.
- [x] Pass 12 focused tests covering discovery, parsing, status codes, redirects, failure paths, and a real HTTP timeout.
- [x] Verify development server, lint, and production build with zero errors; existing homepage/API and mock audit action pass regression checks.
- [x] Commit and push the verified Day 4 changes.

Previous days and the mock audit workflow remain unchanged.
Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 5: Audit pipeline API (COMPLETED)

- [x] Preserve GET /api/audit and add validated, development-only POST accepting domain and buyerPrompt.
- [x] Connect the citation probe, URL extraction, sitemap discovery, and target-domain HTTP checks; provider revised to Groq/Tavily per user-supplied implementation.
- [x] Rank sitemap replacements by string similarity and suggest only verified 2xx URLs for confirmed 404s.
- [x] Persist audit status and confirmed broken links in Supabase with read-back and failed-save cleanup.
- [x] Pass 16 provider/pipeline/API tests and all 12 existing SEO tests, including controlled full-route success, provider failures, and persistence rollback.
- [x] Verify hosted Supabase persistence independently with a temporary test audit; read-back passed and test rows were removed.
- [x] Verify npm run dev, existing GET, unchanged mock workflow, and successful live POST after replacing the blocked Gemini provider.
- [x] Verify live Groq/Tavily POST end-to-end using user-approved openai/gpt-oss-120b: HTTP 201, six search sources, 1,144 sitemap URLs, six checked citations, no warnings, and Supabase audit 060dae60-4847-45d3-9348-8687c584e3a0.
- [x] Verify final lint and production build with zero errors.
- [x] Save and push the verified Day 5 implementation and Groq/Tavily provider replacement.

The user replaced the active probe with Groq plus Tavily. Keep provider identity and search availability explicit; do not silently replace live results with mocks.
Previous completed days and the existing mock UI remain unchanged.
Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 6: Executive audit dashboard UI (COMPLETED)

- [x] Initialize shadcn/ui default preset and install Button, Input, Card, Badge, and Table; retain the system-font setup.
- [x] Replace the starter homepage with the responsive Citemend landing/dashboard and requested hero text.
- [x] Connect domain/buyer-prompt submission to the existing audit POST without changing the backend or mock workspace.
- [x] Display evidence-based citation health, confirmed 404s, verified redirect suggestions, and working Copy 301 Rule controls.
- [x] Verify desktop/mobile screenshots and five browser scenarios for submission, loading, errors, partial reports, empty/healthy reports, validation, copy, and overflow.
- [x] Verify a live stripe.com audit through the UI: HTTP 201, audit 6cf1e454-7e6f-4c33-8b73-58d1df9c0f4c, six citations, 7,176 sitemap URLs, no confirmed 404s; Tavily unavailability correctly shown as a partial-report warning.
- [x] Pass dashboard helper tests and all 28 existing backend tests.
- [x] Verify final lint and production build with zero errors.
- [x] Commit and push Day 6 changes.

Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 7: Testing, bug fixes, and Week 1 retro (COMPLETED)

- [x] Review the existing route, homepage, dashboard, and active Groq/Tavily pipeline without starting authentication work.
- [x] Test the complete dashboard-to-Supabase flow on nextjs.org, stripe.com, vercel.com, supabase.com, and github.com: five HTTP 201 completed reports, 30 citations, six confirmed 404s, no warnings or unresolved checks.
- [x] Independently read back all five saved audits and six broken-link/redirect rows from Supabase.
- [x] Fix citation punctuation parsing, malformed report rendering, numeric-IP domain aliases, request body bounds, and provider/network error messages.
- [x] Pass 34 unit/backend tests and seven browser tests, including rate limits, failed sitemap discovery, real HTTP timeout, frontend timeout, loading, parsing failures, and clipboard behavior.
- [x] Write docs/WEEK1_RETRO.md and docs/week1-live-results.json with observed results and Week 2 authentication handoff.
- [x] Verify final lint and production build with zero errors.
- [x] Commit and push the Week 1 save-point.

Recovery: Ask Codex to inspect and undo the specific broken change.

## Week 1 readiness audit (COMPLETED)

- [x] Execute all seven requested checks in order and fix/re-verify discovered issues.
- [x] Verify 48 unit/integration tests and 10 browser tests; no hydration warnings or runtime errors.
- [x] Verify TypeScript, zero-warning lint, production build, and zero known npm vulnerabilities.
- [x] Verify no configured credential values in source/history/browser assets; complete .env.example.
- [x] Add eight-second SEO budgets, DNS-pinned SSRF protection, SQL-matched database types, and transparent failed/local persistence reports.
- [x] Verify live HTTP 201 completed audit 9234a138-b3aa-46dd-bf79-b5800876a89d with 13 citations and five confirmed 404s; independently verify saved rows and RLS denial.
- [x] Verify production homepage/GET 200 and POST 403; preserve authentication boundary.
- [x] Record docs/WEEK1_READINESS.md and docs/readiness-live-results.json. User-requested save-point 4cbe45d committed and successfully pushed to origin/main.

## Day 8: Clerk authentication integration (COMPLETED)

- [x] Install the Clerk Next.js SDK.
- [x] Add ClerkProvider when server and publishable keys are configured, and integrate the Clerk proxy using the Next.js 16 `proxy.ts` convention.
- [x] Keep the public landing page visible while gating the audit form behind Clerk sign-in, with SignInButton and UserButton controls.
- [x] Enforce a Clerk session in POST /api/audit; unauthenticated requests fail closed.
- [x] Add placeholder Clerk variables to .env.example; keep real credentials in ignored .env.local.
- [x] Verify lint, production build, public homepage HTTP 200, and anonymous POST rejection (HTTP 503 while keys are not configured).

- [x] Confirm live authentication through the user-confirmed Day 9 signed-in audit creation and workspace history result.

The earlier activation-pending note is superseded by the recorded Day 9 live authentication confirmation. The Clerk integration and authenticated workspace flow are complete.
Recovery: Ask Codex to inspect and undo the specific broken change.
## Day 9: User workspaces and audit history (COMPLETED)

- [x] Add a forward-only migration for `audits.user_id` and an owner/date index, preserving older rows as unowned.
- [x] Save the authenticated Clerk user ID with each new audit and verify owner-scoped readback.
- [x] Add a Clerk-protected `/dashboard` page that lists the signed-in user's audit history and broken-link details.
- [x] Keep history reads server-only and filter by the verified Clerk user ID.
- [x] Pass 27 focused audit tests, including owner persistence, auth rejection, and history query isolation.
- [x] Verify `npm run lint`, `npm run build`, and local Clerk navigation/auth guards.
- [x] Apply `supabase/migrations/002_audit_user_ownership.sql` to the hosted project and verify the signed-in user's new stripe.com audit appears with three confirmed HTTP 404 links.

The user confirmed the hosted migration and live audit-history result. Legacy rows remain unowned and are not assigned to an account automatically.
Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 10: Public shareable audit reports (COMPLETED)

- [x] Add public /audit/[id] executive reports with the requested Citemend AI prospect banner.
- [x] Fetch saved audit summaries and confirmed 404 links by validated UUID using server-only Supabase access; keep account identifiers private and RLS unchanged.
- [x] Display redirect suggestions, snapshot limitations, partial/mock disclosures, loading, missing-report, and unavailable-report states.
- [x] Add shareable report links to audit history while preserving Clerk workspace protection.
- [x] Verify three public lookup tests and all 27 existing audit tests.
- [x] Run npm run dev; verify anonymous access to hosted audit 9234a138-b3aa-46dd-bf79-b5800876a89d with five saved 404s, invalid/missing reports, mobile overflow, and no browser runtime errors.
- [x] Verify final npm run lint and npm run build with zero errors.

Report URLs use the existing app host at /audit/[id]. Domain claiming and weekly monitoring remain future work; the banner links to the existing sign-in/audit entry point and states this limitation.
Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 1–10 completion review

- [x] Inspect the existing setup, database migrations, mock workflow, sitemap/status checker, audit pipeline, dashboard, testing records, Clerk authentication, owner-scoped history, and public reports.
- [x] Reconcile Day 8's stale activation status with the user-confirmed Day 9 live signed-in workflow.
- [x] Preserve the agreed Day 3 mock scope and Groq/Tavily provider replacement.
- [x] Confirm that Days 1 through 10 are implemented and marked completed within their recorded scopes.

## Day 11: No coding tasks (COMPLETED)

- [x] Mark Day 11 complete as requested by the user; no coding tasks are required.

## Day 12: Founder follow-ups and redirect export (COMPLETED)

- [x] Add a public report control to copy all saved verified 301 redirects in .htaccess, Vercel JSON, or Shopify CSV format.
- [x] Export only confirmed 404 sources with saved same-domain replacement destinations; exclude unresolved, non-404, and unsafe external redirects.
- [x] Provide accessible format selection and clipboard success/failure feedback.
- [x] Pass four redirect-export tests and verify the anonymous report copies all five redirects in each format.
- [x] Verify npm run lint and npm run build with zero errors.
- [x] Run npm run dev and commit/push the Day 12 save-point.

Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 13: No coding tasks (COMPLETED)

- [x] Mark Day 13 complete as requested by the user; no coding tasks are required.

## Day 14: Week 2 review and audit indexes (COMPLETED)

- [x] Review audit queries and existing indexes: the owner/date index already supports owner-scoped newest-first history; audit UUID lookups use the primary key; broken-link joins use their foreign-key index.
- [x] Add forward-only migration supabase/migrations/003_audit_domain_lookup_idx.sql for (domain, created_at DESC) domain lookups and recent-audit ordering.
- [x] Preserve existing owner and foreign-key indexes; no query or schema behavior changes.
- [x] Verify npm run lint and npm run build with zero errors.

- [x] Apply the migration in the hosted Supabase SQL Editor; the user confirmed it completed successfully.

The hosted index migration is verified by successful application. Live query-plan measurements were not collected.
Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 15: Lemon Squeezy checkout integration (CHECKOUT VERIFIED; WEBHOOK SETUP PENDING)

- [x] Add a Clerk-authenticated checkout endpoint that creates a Lemon Squeezy checkout for the configured Pro variant and passes the authenticated Clerk user ID as checkout custom data.
- [x] Add the dashboard Pro upgrade button ($39/month) with loading and error feedback.
- [x] Add a signed, bounded webhook endpoint for subscription created and cancelled events; validate the configured store and product before writing.
- [x] Add the RLS-enabled subscriptions table migration and matching database types.
- [x] Support the LEMONSQUEEZY_* variable names already present in .env.local while retaining the documented LEMON_SQUEEZY_* names.
- [x] Validate the API key and confirm the configured store, product, and variant relationships through the Lemon Squeezy API.
- [x] Create a checkout preview successfully; Lemon Squeezy returned a valid checkout session with a $39.00 total.
- [x] Record the user's confirmation that the subscriptions migration was applied in the Supabase SQL Editor; a direct no-row REST check returned HTTP 401 and could not independently verify the table.
- [ ] Add a webhook signing secret to .env.local and register the production endpoint for subscription_created and subscription_cancelled.
- [ ] Set NEXT_PUBLIC_APP_URL to the production app origin before using production checkout.

The configured store is Cite_Mend and its published product is CiteMend Pro Tier; the Default variant is a $39/month subscription. Checkout preview succeeded. Subscription syncing remains inactive until webhook signing and registration are completed.
Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 16: Pro tier access control and paywall gating (COMPLETED)

- [x] Check the authenticated user's subscription on the server, including trial, payment-retry, and cancellation grace-period states; fail closed when subscription data is unavailable.
- [x] Enforce the user-confirmed allowance of one saved free audit per account and unlimited Pro audits. Reserve the free slot using the existing audits primary key to prevent concurrent requests from consuming multiple free audits.
- [x] Gate dashboard and public-report one-click redirect exports through an authenticated server-side Pro check; show an accessible upgrade dialog for free or signed-out users.
- [x] Add a dashboard upgrade panel for automated weekly monitoring, clearly marked as coming soon.
- [x] Process subscription_updated webhooks and prevent older events or conflicting owners from overwriting newer subscription state.
- [x] Pass 46 focused and regression tests, plus browser checks for anonymous/free upgrade dialogs, mocked Pro copying, and mobile layout.
- [x] Verify npm run lint and npm run build with zero errors. The existing development server was used on port 3000.

Weekly monitoring is not implemented yet. As agreed, configure the production Lemon Squeezy webhook during Vercel deployment; subscribe to subscription_created, subscription_cancelled, and subscription_updated, and set the webhook secret and production app URL. Pro activation depends on that synchronization.
Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 17: Automated weekly Pro scans (CODE COMPLETE; ACTIVATION PENDING)

- [x] Add a CRON_SECRET-protected weekly scan API and a secret-verified Supabase Edge relay.
- [x] Queue distinct Pro-owned domains with paginated discovery, access rechecks, durable leases, bounded retries, idempotent audit IDs, and run/job logs.
- [x] Use the active Groq/Tavily citation probe for scheduled and interactive scans, and save confirmed 404s through the existing pipeline.
- [x] Re-run the live weekly worker check with the configured Groq model and Tavily: `example.com` returned eight search sources and 14 citation URLs; the database save was stubbed so no hosted audit was created.
- [x] Preserve new audit buyer prompts after migration 005, with a safe compatibility fallback before migration and a standard prompt for historical audits.
- [x] Prepare the 9:00 AM Asia/Kolkata Monday pg_cron schedule, Vault-based secret setup, and deployment instructions.
- [x] Generate a private local CRON_SECRET without exposing it; verify the local route rejects missing or incorrect bearer tokens.
- [x] Pass weekly scan and previous-day regression tests, npm run lint, and npm run build.
- [x] Enable pg_cron and pg_net in Supabase and apply supabase/migrations/005_weekly_scans.sql; the user confirmed both extensions are on and the SQL Editor migration succeeded.
- [ ] Deploy the app and Edge Function, configure matching secrets and Vault entries, and run supabase/setup/weekly_cron.sql.
- [ ] Verify a scheduled scan with an eligible Pro account after deployment.

The hosted migration and extension activation are recorded from the user's confirmation. Production billing webhook setup remains deferred until Vercel deployment as agreed. See docs/WEEKLY_SCANS.md for the remaining activation and verification steps.
Recovery: Ask Codex to inspect and undo the specific broken change.

## Day 18: Weekly Pro email alerts (COMPLETED; PRODUCTION DELIVERY PENDING VERCEL)

- [x] Add Resend-backed HTML and text digests for newly confirmed weekly 404 citations, with verified same-domain 301 suggestions and public report links.
- [x] Resolve each Pro recipient through their primary Clerk email, escape report content, and use one durable digest per user and weekly run.
- [x] Add migration 006 for a server-only digest outbox with leases, retries, provider message IDs, and a run preparation marker.
- [x] Keep weekly runs open until digest delivery or skip is recorded; use a stable Resend idempotency key on retries.
- [x] Document sender verification and deployment settings without claiming Groq/Tavily results came specifically from ChatGPT or Perplexity.
- [x] Pass all 86 regression tests, npm run lint, and npm run build with zero errors; local cron route still rejects anonymous requests.
- [x] Apply migration 006 in hosted Supabase; the user confirmed the SQL Editor migration succeeded.
- [x] Add RESEND_API_KEY and RESEND_FROM_EMAIL to ignored .env.local; the Resend API key authenticated successfully.
- [ ] Configure a verified custom sender domain for production email and verify a real Pro alert after Vercel deployment.

The configured sender currently uses Resend's sandbox domain and did not appear among the account's verified domains. No email was sent during this check. Production email delivery remains pending until a verified sender and the deployed weekly scheduler are configured.

## Day 19: Dashboard polish and UI enhancements (COMPLETED)

- [x] Install the shadcn Sonner component and show accessible toast feedback for 301 copy, Pro upgrade prompts, checkout handoff, and failures.
- [x] Add responsive dashboard cards for total saved scans, current 404s from each domain's latest scan, and redirects ready to apply.
- [x] Add a dashboard loading skeleton while the owner-scoped history loads.
- [x] Verify all 87 unit and regression tests, lint, and production build with zero errors.
- [x] Check the local development server. The dashboard redirects signed-out visitors as expected.

The browser suite now checks the current anonymous sign-in gate, responsive layout, dashboard redirect, and protected APIs; all six tests pass. Signed-in audit behavior remains covered by focused tests and needs an authenticated Clerk browser fixture for a future end-to-end browser check. Redirect suggestions are not deployed automatically, so the metric is labeled "Redirects ready."

## Day 20: End-to-end billing and cron testing (COMPLETED LOCALLY; LIVE PRO FLOW PENDING VERCEL)

- [x] Add a development-only Lemon Squeezy test-mode checkout toggle and reject a checkout that is not confirmed as test mode.
- [x] Create a real test-mode checkout session without submitting a card payment.
- [x] Add a development webhook simulator covering signed create/cancel/update events, Pro access, one weekly job, and one rendered redirect digest with in-memory writes only.
- [x] Manually trigger an authenticated weekly `drain`; the hosted queue was idle with zero eligible Pro subscriptions, so no scan or Pro email was sent.
- [x] Send a rendered test digest to Resend's test delivery address and confirm its `delivered` event; no customer was emailed.
- [x] Pass all 89 regression tests, six Clerk-aware browser tests, npm run lint, and npm run build with zero errors.
- [ ] Complete a test-mode payment and verify the hosted subscription, weekly scan, and Pro inbox delivery after Vercel webhook and scheduler deployment.

See docs/DAY20_TESTING.md for repeatable commands and the limits of local verification.

## Day 21: Week 3 retro and Cloudflare Worker preparation (COMPLETED)

- [x] Review Week 3 billing, Pro gating, weekly scans, email delivery, and public report paths without changing completed features.
- [x] Check `app/` and `lib/` for unused imports, console warnings, debug statements, and unfinished placeholders; keep the intentional generic cron error log.
- [x] Remove an untracked temporary live-probe script left from an earlier verification.
- [x] Record code integrity findings, pending deployment checks, and a scoped Cloudflare 404 listener architecture in docs/WEEK3_RETRO.md.
- [x] Verify lint, TypeScript, regression tests, browser tests, and the production build with zero errors.

No Cloudflare Worker implementation or deployment was started on Day 21.

## Day 22: Cloudflare Worker edge 404 interceptor (COMPLETED)

- [x] Initialize a standalone TypeScript Cloudflare Worker with Wrangler and a local KV binding.
- [x] Forward requests to the origin and use an active KV rule to return a 301 when the origin responds 404 or the request has a ChatGPT, Perplexity, Claude, or Gemini referrer.
- [x] Pass through requests without a valid rule; restrict destinations to HTTPS on the same hostname and fail open on KV errors.
- [x] Verify local `wrangler dev` on port 8787 with seeded KV redirects, plus Worker tests and TypeScript checks.
- [x] Keep the independent Worker types out of the Next.js type check; pass root lint and production build with zero errors.
- [x] Complete Wrangler OAuth, create the hosted `citemend-redirects` KV namespace, and bind it as `REDIRECTS`.

See `edge-worker/README.md` for local verification and account setup. The Worker is not deployed to a Cloudflare zone yet.

## Day 23: Supabase-backed edge redirects (COMPLETED; ZONE ROUTE PENDING)

- [x] Add the `redirect_rules` table with owner-only writes, anonymous read access limited to active routing columns, and a unique hostname/path key. The user confirmed migration 007 succeeded in the hosted SQL Editor.
- [x] Add a Pro-only dashboard action to publish verified same-domain 301 suggestions and allow owners to disable them.
- [x] Make the Worker query active rules through Supabase REST using its low-privilege public key. Use a five-second edge cache and fail open without using stale KV data when Supabase is unavailable.
- [x] Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Cloudflare Worker secrets; upload the Worker code with no zone route attached.
- [x] Verify hosted anonymous REST lookup returns HTTP 200 and denies the private owner column with HTTP 401. A temporary hosted rule produced a local Worker 301, then a 404 after deactivation; the rule was removed.
- [x] Pass Worker tests and TypeScript, all existing regression and browser tests, root lint, and production build.

Rules can take up to five seconds to update at an edge location. No live hostname is routed through this Worker yet; domain control must be verified before attaching a customer zone route.

## Day 24: High-converting landing page and free preview (COMPLETED)

- [x] Redesign the homepage with a live domain preview widget, stronger citation-recovery copy, founder-focused sections, a comparison, FAQ, and the requested BITS Pilani maker badge.
- [x] Add a public read-only preview of homepage and default sitemap HTTP status without bypassing Clerk protection or the one-saved-audit free limit. Clearly distinguish this preview from the full AI citation audit.
- [x] Keep the existing signed-in audit workspace and report flow intact; carry a previewed domain into the protected form.
- [x] Show clearly labeled founding-customer placeholders without inventing endorsements, and compare Citemend Pro at $39/month with Ahrefs Brand Radar's $199/month AI Visibility Index while noting Ahrefs Custom Prompts starts at $50/month.
- [x] Verify a live local preview for `example.com`, desktop/mobile layout, 94 regression tests, seven browser tests, lint, and production build.

## Day 25: Vercel production deployment (COMPLETED; LIVE AUTH PENDING)

- [x] Create and link the Vercel project to this repository; correct its name to `citemend`, and set the Next.js framework preset and Node.js 24.x.
- [x] Configure all existing application variables from the ignored `.env.local` in Vercel Production without committing their values. Set `NEXT_PUBLIC_APP_URL` to the stable production origin.
- [x] Deploy and verify the production build is Ready; move the public origin to https://citemend.vercel.app. Disable Vercel Authentication so the public site is reachable.
- [x] Verify the anonymous homepage and read-only preview return HTTP 200; the audit and cron APIs reject unauthenticated requests.
- [x] Run local lint and production build with zero errors.
- [x] Connect the GitHub repository in Vercel Settings > Git. After the user authorized the app, Vercel CLI confirmed `TusharYadav-del/citemend` is connected.
- [x] Verify a new `main` push triggers a Ready production deployment under `citemend` and that https://citemend.vercel.app serves HTTP 200.
- [x] Align the app, report, weekly email, tests, and plan with the Citemend name.
- [ ] Replace the development Clerk keys with production instance keys in Vercel Production and verify browser sign-in. An anonymous `/dashboard` request currently receives Clerk's `protect-rewrite` 404 with the development keys.

The current Lemon Squeezy configuration remains in test mode. The production webhook signing secret and verified Resend sender are still pending as recorded in Days 15, 18, and 20. The weekly scheduler is also pending from Day 17. These integrations should be verified after their production credentials and external configuration are ready.

## Day 26: Product Hunt and launch copy (KIT COMPLETED; PRODUCT HUNT DRAFT PENDING)

- [x] Prepare Product Hunt name, tagline, short description, maker comment, topics, and pricing notes in `docs/DAY26_LAUNCH_KIT.md`.
- [x] Create a 240 × 240 thumbnail, two 1270 × 760 gallery assets, and a real public homepage screenshot in `docs/launch-assets/`.
- [x] Draft a five-post X thread, LinkedIn post, and candid Show HN submission using the Citemend name.
- [x] Source the 51% figure to G2 with its exact B2B software-buyer and "more often than Google" scope; distinguish early Gemini prototyping from the active Groq/Tavily pipeline.
- [x] Keep launch claims aligned with the current Cloudflare route, weekly scheduler, Resend sender, and production Clerk limitations.
- [ ] Save an unpublished Product Hunt product draft. The old `/upcoming` URL returns 404; the current flow is Submit > New Product > Create Draft. The account browser was unavailable from this workspace, so the maker must save the prepared draft and share its URL for verification.
- [x] Verify five X posts fit the character limit, the Product Hunt image sizes, `npm run lint`, and `npm run build` with zero errors.
- [x] Save the launch kit in Git and confirm a clean working tree.

## Closed Pro design-partner beta (HOSTED CONFIGURATION COMPLETE; LIVE SIGN-IN PENDING)

- [x] Require a signed-in Clerk account and its primary email for beta requests. Grant 30 days of Pro only to `BETA_INVITED_EMAILS`; keep other accounts in `pending_beta` without Pro quota.
- [x] Store invited, pending, and expired beta states in `subscriptions` alongside paid Lemon Squeezy rows. Keep paid subscriptions untouched and preserve checkout when live billing is explicitly enabled.
- [x] Enforce beta expiry in server Pro checks and weekly target selection; persist `expired` without deleting accounts or records. Show active, pending, expired, and free states in the upgrade UI.
- [x] Verify invited, waitlisted, paid, non-renewal, and expiration paths with automated tests; pass lint and production build.
- [x] Apply `supabase/migrations/008_design_partner_beta.sql` in the hosted Supabase SQL Editor and set `BETA_INVITED_EMAILS` in Vercel Production (user confirmed both on 2026-11-02).
- [ ] Verify an invited account and a non-invited account in the production browser after the production Clerk keys are configured (Day 25 prerequisite).


## Day 28: Batch 1 retro and transition to Phase 2 (COMPLETED; HISTORICAL DASHBOARD REVIEW LIMITED)

- [x] Read project instructions and inspect the existing application, routing, API budgets, billing, persistence, and regression coverage.
- [x] Review available production Vercel request/runtime evidence, aggregate Supabase audit/queue health, and Lemon Squeezy orders/subscriptions through read-only CLI/API checks; document retention and dashboard-access limits without claiming a complete launch-weekend review.
- [x] Fix the reproducible public-preview request-body edge case: bound streamed uploads to 500 bytes, handle interrupted/invalid uploads, and return HTTP 408 after a five-second body-read timeout.
- [x] Pass all 103 root unit/integration tests, including interrupted, oversized, stalled, and invalid UTF-8 preview uploads.
- [x] Verify npm run lint and npm run build with zero errors.
- [x] Record the four-week retrospective, observed traffic limits, and existing Phase 2 activation handoff in docs/DAY28_RETRO.md; do not start Phase 2 features.

Day 28's stabilization and retrospective scope is complete. Historical Vercel logs beyond retention, Web Analytics, Supabase server logs, and authenticated dashboard UI review remain unverified. Production Clerk, billing webhook, scheduler, sender-domain, and Worker-route activation retain their earlier recorded status. Day 27 was not present in this plan and is not marked complete by this task.

Recovery: Ask Codex to inspect and undo the specific broken change.


## Day 29: pgvector sitemap schema (COMPLETED)

- [x] Add forward migration 009_pgvector_sitemaps.sql without colliding with existing migration 002.
- [x] Enable vector, add the 768-dimensional sitemap_pages table and domain/URL uniqueness, and provide a bounded cosine RPC with domain/model isolation.
- [x] Restrict the table and RPC to server-side service-role access; keep existing tables and features unchanged.
- [x] Execute the migration in local PostgreSQL with pgvector and verify cosine ordering, threshold/count filtering, domain/model isolation, and public access denial.
- [x] Verify npm run lint and npm run build with zero errors.
- [x] Apply migration 009 in the hosted SQL Editor (user confirmed success); independently verify server HTTP 200, public HTTP 401, 200 stored sitemap vectors, and a live cosine RPC match.

The user applied the SQL in the existing project. Hosted server access, public denial, vector storage, and cosine matching were independently verified after application. The existing 002 migration was preserved.


## Day 30: Gemini sitemap embeddings and semantic redirects (COMPLETED; SIGNED-IN BROWSER CHECK PENDING)

- [x] Add server-only generateUrlEmbedding and bounded batch embedding with 768-dimensional validation, normalization, query/document task types, and provider timeouts.
- [x] Use supported gemini-embedding-001 by default because text-embedding-004 was retired; verify a real 768-dimensional response with the existing local key and document the explicit model setting.
- [x] Add indexDomainSitemap, deterministic core-page priority and a 200-URL cap, batches of 20, seven-day model-aware caching, and domain/URL upserts.
- [x] Connect semantic candidates to the existing authenticated audit pipeline, verify current sitemap membership, exact hostname, non-self target and live 2xx status, and preserve the existing matcher on failure or low similarity.
- [x] Display the measured Match Confidence percentage for semantic suggestions with a similarity explanation; never invent a fixed 94% score or attach it to lexical fallback.
- [x] Add the manual dev:index-sitemap command and docs/SEMANTIC_MATCHING.md, including activation, model lifecycle, limits, and confidence semantics.
- [x] Pass all 112 unit/integration tests, npm run lint, and npm run build with zero errors.
- [x] Store and read back 200 real supabase.com embeddings; exercise the hosted cosine RPC and live HTTP checks: pricing-old returned 404 and matched the live pricing page at a measured 76%.
- [x] Run npm run dev on port 3000 and pass all seven existing browser regressions.
- [ ] Confirm a signed-in browser audit result with the user's authenticated session.

The existing Groq/Tavily citation probe, saved report schema, authentication, quotas, and Pro controls remain in use. Live Gemini access and hosted sitemap storage/RPC were verified after the user applied migration 009. The user approved gemini-embedding-001. The controlled authenticated route fixture verifies a 0.94 similarity becomes 94%; this is not a claimed live score. Confidence is returned with the current audit and is not added to historic saved reports. The live verification used a controlled broken citation with real sitemap discovery, Gemini vectors, hosted matching, and live HTTP checks, and did not create a hosted audit. See docs/day30-live-results.json. The existing browser tests cover anonymous workflows; authenticated browser confirmation remains separate.


## Day 31: Competitor citation gap analyzer backend (COMPLETED)

- [x] Install Cheerio and add lib/citation-capsule.ts plus authenticated POST /api/capsule.
- [x] Safely fetch bounded public HTML with browser headers, DNS-pinned SSRF checks and checked redirects; extract H1/H2, FAQ markup and JSON-LD FAQs, paragraph/table structure, schema types, and up to 1,500 main-text words.
- [x] Generate a two-sentence structural insight, exactly 80 words of escaped semantic section HTML, and valid FAQPage/Product JSON-LD; keep competitor facts separate from target evidence and make causation/fact-review limits explicit.
- [x] Use user-approved gemini-3.8-flash with an explicitly approved gemini-3.6-flash fallback; report the actual model, validate output, and allow one bounded repair instead of truncating or padding drafts.
- [x] Capture real answer-text citation gaps in new audits without confusing search-only sources, general references, or provider identities with proven competitor rankings.
- [x] Apply migration 010_audit_citation_gaps.sql (user confirmed); independently verify owner-scoped hosted save/read, another-owner exclusion, public HTTP 401, and cleanup of the temporary fixture.
- [x] Preserve core audit saves on optional evidence failure and keep buyer prompts private to their owner.
- [x] Enforce sign-in, server-side Pro schema exports, encrypted owner-bound expiring export tokens, upload/body/deadline limits, and private no-store responses.
- [x] Verify a real Ahrefs structure extraction and an 80-word Gemini capsule with the approved fallback; record docs/day31-live-capsule.json and docs/DAY31_BACKEND.md.
- [x] Pass all 128 unit/integration tests, npm run lint, and npm run build with zero errors.

The requested gemini-2.5-flash returned HTTP 404 for this key. The approved models are explicit and configurable; no provider identity is hidden. The live competitor URL was supplied manually for verification and is not a claimed ranking result.


## Day 32: Citation Capsule dialog and one-click copy (COMPLETED; SIGNED-IN LIVE CHECK PENDING)

- [x] Install shadcn Dialog, Tabs, and Textarea and implement components/CitationCapsuleModal.tsx.
- [x] Show the requested Win This Citation action for recorded answer-text gaps in fresh reports, the owner's dashboard, and owner-authenticated shareable reports.
- [x] Add amber structural insights, an 80-word sandboxed/CSP-restricted HTML preview, selectable HTML, and JSON-LD tabs with copy feedback.
- [x] Recheck Pro access on the server for every JSON-LD copy, show only a generic blurred preview to free accounts, and reuse the existing upgrade/sign-in flow. Active beta grants retain their existing Pro semantics.
- [x] Handle loading, cancellation, provider failure/retry, expired sessions/tokens, clipboard denial, keyboard dismissal, and responsive wrapping.
- [x] Keep prompts and saved competitor evidence private to their owner; do not fabricate capsule actions for historical audits without evidence.
- [x] Verify all 13 browser scenarios (eight real-app cases and five isolated real-component cases with controlled auth/API responses), all 128 unit/integration tests, npm run lint, and npm run build with zero errors.
- [ ] Confirm the complete click-through in the user's own signed-in browser on a newly saved qualifying audit. An authenticated production session was not impersonated or manufactured for testing.

Backend extraction and Gemini generation were verified live separately from the controlled UI fixtures. Migration 010 is applied and its owner/public access behavior is verified. Existing audits without saved citation-gap evidence remain unchanged; run a new audit to capture that evidence. See docs/CITATION_CAPSULES.md.


## Day 33: Auto-generating the 5 best buyer prompts per domain (COMPLETED; LIVE GENERATION CHECK PENDING)

- [x] Add authenticated POST `/api/prompts/suggest`; safely fetch bounded homepage HTML with DNS-pinned public connections, validate redirects, and extract title, description, H1, and H2 metadata using Cheerio.
- [x] Generate exactly five category-focused, brand-free buyer prompts plus one brand-specific pricing/features prompt with Gemini; validate model output and support the requested `gemini-2.5-flash` model with the documented `gemini-3.6-flash` fallback.
- [x] Add the Auto-Generate Buyer Prompts action and six selectable/editable prompt pills to the shared audit workspace used from the homepage and dashboard workflow.
- [x] Verify `npm run lint`, a successful production build, and `git diff --check` with no errors. A final repeat build was blocked before compilation because Windows denied unlinking a generated `.next/static` reparse point.
- [ ] Verify live generation in an authenticated browser session; no user session was impersonated, and interactive domain/model timing was not measured.

The prompt endpoint uses the existing signed-in audit boundary and homepage SSRF defenses. Set `GEMINI_PROMPT_MODEL` and optionally `GEMINI_PROMPT_FALLBACK_MODEL` in the server environment if the project key supports different models. The audit still runs only after the user selects/edits a prompt and submits.


## Day 34: Multi-prompt parallel execution & progress bar UI (COMPLETED; LIVE SIGNED-IN CHECK PENDING)

- [x] Extend the existing authenticated `/api/audit` flow to accept one legacy prompt or up to five buyer prompts, preserving free-audit reservation, Pro access, persistence, and provider error handling.
- [x] Run sitemap discovery and all citation probes concurrently; tolerate individual prompt failures, merge/deduplicate citations, verify target URLs with bounded parallel HTTP checks, and retain existing semantic/lexical redirect verification.
- [x] Return the combined buyer prompts and a 0–100 verified AI visibility/link health score in the combined report.
- [x] Add the shadcn-style Progress primitive and animated four-stage audit progress panel; allow selection of up to five generated prompts and display the combined results in the existing report view.
- [x] Verify `npm run lint`, `npm run build`, and `git diff --check` successfully. The build used a temporary output directory because OneDrive intermittently locks `.next/static`; generated build output and temporary config changes were removed.
- [ ] Verify the complete five-prompt run and progress transitions in a signed-in local browser. Node 26's built-in test runner could not start in this environment (`uv_os_get_passwd returned ENOMEM`); no live audit was created.

The citation probe remains the configured Groq/Tavily pipeline from earlier project decisions; the progress UI names those providers. Semantic pgvector matching is still gated by the existing Gemini embeddings configuration, with lexical verified redirect suggestions retained as fallback. The report stores the first prompt in the existing `buyer_prompt` column for history compatibility and includes all prompts in the live combined response.


## Day 35: Week 5 production push & database cleanup (COMPLETED)

- [x] Set the audit and capsule API route execution limits to 60 seconds; `npm run lint` and the production build pass.
- [x] Push commit `85a702e` to `main` and verify its Vercel Production deployment reaches Ready (24-second build). The live alias is `https://citemend.vercel.app`.
- [x] Verify all eight core production variable names are present and `NEXT_PUBLIC_APP_URL` matches the production origin. Vercel masks 11 secrets, so their values were not inspected. Model overrides, the Lemon Squeezy webhook secret, the old-audit prompt override, and capsule signing override are absent; these are optional/defaulted or remain activation-pending from their earlier day entries.
- [x] Verify hosted Supabase `match_sitemap_url`: the server secret key returned HTTP 200, while the publishable key was denied with HTTP 401.
- [x] Verify the live homepage and a previously verified public report each return HTTP 200; the latter confirms the deployed server can read the hosted report database.
- [x] Verify `git diff --check` with no errors.

Hosted database role permissions are verified. Production Vercel secret values remain concealed by the platform, so only their configured presence—not the values themselves—was checked. `maxDuration` is set in source; Vercel's deployment inspection does not expose per-route limits.


## Day 36: Telemetry & live redirect database tables (COMPLETED)

- [x] Add forward migration `011_live_pixel_telemetry.sql`; migration number 003 is already used by an earlier audit index migration.
- [x] Extend the existing `redirect_rules` table with the live-pixel domain, destination, confidence, active, and recovered-hit columns while preserving its existing owner and Worker schema; synchronize compatibility columns and enforce unique `(domain, source_path)`.
- [x] Create indexed `ai_404_events` telemetry with server-only `service_role` access and row-level security enabled.
- [x] Update Supabase database types; legacy redirect confidence stays null because no measured confidence exists for those rows.
- [x] Verify `npm run lint`, `npm run build`, and `git diff --check` successfully.
- [x] Apply migration 011 in the hosted Supabase SQL Editor (user confirmed success).

The existing redirect table was extended rather than replaced to avoid breaking Day 23 data and access policies. The user confirmed the hosted migration succeeded. Day 37's `/api/pixel/resolve` endpoint is not part of this day.


## Day 37: High-speed edge resolution API (`/api/pixel/resolve`) (COMPLETED)

- [x] Add a Web API-based `POST` and `OPTIONS` handler with wildcard CORS headers and bounded JSON input. The route uses edge-compatible Web APIs; this Next.js app has `cacheComponents` enabled, which rejects an explicit route `runtime = "edge"` setting.
- [x] Validate the reported domain, full URL, broken path, and browser origin; only return same-domain HTTPS redirect destinations.
- [x] Resolve existing active rules, record telemetry and recovered-hit counts, and create a threshold-qualified semantic rule from `generateUrlEmbedding()` plus `match_sitemap_url` when a saved audit supplies the existing owner required by `redirect_rules`.
- [x] Log unresolved 404 events and keep telemetry server-only through the existing `service_role` database client.
- [x] Verify `npm run lint`, `npm run build`, and `git diff --check`. The build used a temporary output directory because OneDrive blocked deletion in `.next`; temporary config and generated output were removed.
- [x] Run `npm run dev`; verify OPTIONS returns 204 with wildcard CORS and an invalid JSON-shaped POST returns a JSON 400 with wildcard CORS in 41 ms after startup.

A valid DB-backed hit was not sent from this local environment because `.env.local` contains live Supabase and Gemini credentials; doing so could write real 404 telemetry or create an active redirect. The local latency check covers request validation, not the external embedding/database resolution path. The route's `runtime` remains Next.js's default Node runtime due to the app-wide Cache Components constraint, while its handler and imports use edge-compatible APIs.


## Day 38: Embeddable 1-line recovery script (`public/citefix-pixel.js`) (COMPLETED)

- [x] Add a zero-dependency vanilla JavaScript pixel under 1.5 KB (1,493 bytes) that reads its script `data-domain` or falls back to the current hostname.
- [x] Detect 404 pages using the page title, `window.CITEFIX_IS_404`, or the ChatGPT UTM plus `[data-citefix-404]` marker; support `data-catch-all="true"` and the requested AI referrers/UTM sources.
- [x] Show a compact redirect toast, POST the page/referrer information to `/api/pixel/resolve` on the script host, and navigate only to a same-domain HTTPS destination returned by the resolver.
- [x] Verify JavaScript syntax, `npm run lint`, `npm run build`, and `git diff --check`.
- [x] Run `npm run dev` and verify `/citefix-pixel.js` serves HTTP 200 as JavaScript, byte-for-byte matching the 1,493-byte public asset.


## Day 39: Recovered traffic & pixel setup dashboard (COMPLETED; SIGNED-IN SIMULATION CHECK PENDING)

- [x] Add `/dashboard/pixel` behind Clerk authentication and link it from the audit dashboard navigation.
- [x] Add Shopify, WordPress, Next.js, and Webflow/Framer installation tabs with the user's latest audited domain prefilled in the one-line script snippet and a copy action.
- [x] Show owner-scoped redirect rules, domain telemetry, AI source badges, recovered-hit totals, editable same-domain HTTPS targets, and active/inactive controls; preserve the existing Pro requirement for publishing or editing redirects.
- [x] Add a simulation button that sends a ChatGPT-referrer POST to `/api/pixel/resolve` using an existing active rule and refreshes the event table/counter. Permit this dashboard-origin request only for a signed-in user with an audit for that domain.
- [x] Pass `npm run lint`, `npm run build`, and `git diff --check`; run `npm run dev` and verify the page redirects anonymous users to Clerk while the dashboard API returns 401 without a session.
- [ ] Click the simulation with the user's signed-in session and verify the resulting event and recovered-hit increment. No authenticated browser session was available, and simulating writes a real test event and increments a rule's counter.

Pixel activity refreshes every 30 seconds. The test button deliberately uses the first active rule and creates a real ChatGPT-attributed test event; it is disabled until an active rule exists. A successful resolver check confirms the endpoint and telemetry path, but does not independently prove the script is installed on the customer's site.


## Day 40: Instant Slack & Discord webhook alerts (COMPLETED)

- [x] Add migration `012_audit_webhook_url.sql` and update database types for the per-audit webhook setting.
- [x] Add a server-only notifier that validates Slack/Discord HTTPS webhook URLs, formats provider-specific alerts, and sends with a timeout.
- [x] Add authenticated dashboard actions to save/remove a webhook and send a test alert without returning the secret URL to the browser.
- [x] Schedule alerts after successful AI-referrer redirects so webhook delivery does not delay visitor recovery.
- [x] Verify `npm run lint`, `npm run build`, and `git diff --check`.
- [x] Apply migration 012 in hosted Supabase (user confirmed success).

The user will test live Slack webhook delivery later by saving the URL in `/dashboard/pixel` and selecting **Send Test Alert**.


## Day 41: Interactive landing-page sandbox demo (COMPLETED)

- [x] Add an interactive split-screen ChatGPT-style recommendation and simulated broken-link experience immediately below the homepage hero.
- [x] Add an accessible recovery switch and clickable simulated link; show dead-end behavior when off and semantic recovery to `acme.io/pricing` when on, including sample similarity, timing, and Slack alert status.
- [x] Keep the demo self-contained: it makes no external requests and labels its performance and match values as illustrative.
- [x] Verify `npm run lint`, `npm run build`, `git diff --check`, and local homepage HTTP 200 with the demo present.

The browser access host was unavailable, so the switch was not clicked through in Chrome during this run.


## Day 42: Week 6 production deployment & CORS/load verification (COMPLETED)

- [x] Explicitly bypass Clerk middleware for public `/api/pixel/resolve` while preserving authentication on dashboard routes.
- [x] Configure wildcard CORS and public cache headers for `/citefix-pixel.js`; keep resolver responses wildcard-CORS and `no-store`.
- [x] Pass `npm run lint`, `npm run build`, and `git diff --check`.
- [x] Deploy commit `a69e7da` to `main`; GitHub reported the Vercel deployment check successful.
- [x] Verify production from `https://citemend.vercel.app`: external-origin OPTIONS returned 204 with wildcard CORS; malformed unauthenticated POST reached the resolver and returned 400 JSON with wildcard CORS; pixel script returned 200 with wildcard CORS and public cache headers.
- [x] Run 20 concurrent read-only production OPTIONS requests: 20/20 returned the expected CORS response in 1.39 seconds total.

Only preflight requests were used for the concurrency check; no production telemetry or redirect rules were written.


## Day 43: CMS integration schema & Shopify redirect helper (CODE COMPLETE; HOSTED SETUP PENDING)

- [x] Add forward migration `013_cms_integrations.sql`; migration `004` is already assigned to Lemon Squeezy subscriptions.
- [x] Restrict `cms_connections` to trusted server-role database access with RLS enabled; store the `access_token` field as an authenticated AES-256-GCM envelope rather than plaintext.
- [x] Add server-only token encrypt/decrypt helpers and a validated `urlRedirectCreate` GraphQL helper, including the required `write_online_store_navigation` scope note.
- [x] Update database types and document the required private `SHOPIFY_TOKEN_ENCRYPTION_KEY` environment variable.
- [x] Pass `npm run lint`, `npm run build`, and `git diff --check`; run `npm run dev` and verify the homepage returns HTTP 200.
- [ ] Apply migration 013 in hosted Supabase and configure a private 32-byte encryption key before storing any merchant token. Dashboard browser access is unavailable in this environment; the SQL is ready in `supabase/migrations/013_cms_integrations.sql`.

The Shopify helper targets Admin GraphQL API `2026-10`: the prompt's `2025-01` API version has been retired. See [Shopify API version schedule](https://shopify.dev/docs/api/usage/versioning). A custom app needs the `write_online_store_navigation` access scope to create redirects.
