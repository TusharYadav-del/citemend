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

## Day 5: Audit pipeline API (IN PROGRESS)

- [x] Preserve GET /api/audit and add validated, development-only POST accepting domain and buyerPrompt.
- [x] Connect live Gemini grounding, response/metadata URL extraction, Google citation redirect resolution, sitemap discovery, and target-domain HTTP checks.
- [x] Rank sitemap replacements by string similarity and suggest only verified 2xx URLs for confirmed 404s.
- [x] Persist audit status and confirmed broken links in Supabase with read-back and failed-save cleanup.
- [x] Pass 12 pipeline/API tests and all 12 existing SEO tests, including controlled full-route success, provider failures, and persistence rollback.
- [x] Verify hosted Supabase persistence independently with a temporary test audit; read-back passed and test rows were removed.
- [x] Verify npm run dev, existing GET, and unchanged mock workflow; live POST correctly returns a safe Gemini 429 without saving an audit.
- [ ] Verify a successful live POST end-to-end when Google accepts grounded requests (currently blocked by upstream HTTP 429).
- [x] Verify final lint and production build with zero errors.
- [x] Save the verified Day 5 implementation in Git; successful live Gemini verification remains pending.

The user requested live Gemini for Day 5. Do not silently replace it with mock
results or mark live end-to-end verification complete while Google rejects it.
Previous completed days and the existing mock UI remain unchanged.
Recovery: Ask Codex to inspect and undo the specific broken change.
