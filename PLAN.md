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

- [x] Add public /audit/[id] executive reports with the requested CiteFix AI prospect banner.
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
