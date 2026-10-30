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

## Day 3: Gemini SDK and Google Search grounding (IN PROGRESS)

- [x] Install @google/genai and add server-only lib/gemini.ts.
- [x] Implement runCitationProbe(domain, prompt) with gemini-3.8-flash, Google Search, raw grounding metadata, sources, and citation segments.
- [x] Add a development-only server-action test form at /dev/citation-probe; previous app and database features remain unchanged.
- [x] Configure GEMINI_API_KEY in ignored .env.local; Google model listing authenticates successfully.
- [ ] Verify a live grounded Gemini response through the server action.
- [x] Verify development routes and server-action missing-key handling; lint and production build pass. Mocked SDK checks cover citation mapping, missing metadata, and invalid inputs.
- [x] Save the verified Day 3 implementation in Git; live verification remains blocked by Google project quota.

Recovery: Ask Codex to inspect and undo the specific broken change.

Live verification blocker: Google rejects gemini-2.5-flash for new users. The
user approved gemini-3.8-flash, which currently returns HTTP 429
RESOURCE_EXHAUSTED for this key's project. Await available project quota before
marking the live probe and Day 3 complete. Production probe route returns 404;
the existing homepage and placeholder API still return HTTP 200.

Quota diagnostics: the saved key has no shell override or surrounding whitespace.
Google returned 503 high demand for plain Gemini 3.8 Flash generation and 429
RESOURCE_EXHAUSTED for grounded generation, without a specific quota metric.
The exact quota cause is unconfirmed; available general quota alone does not
verify model-specific or Google Search limits. Automatic retries are restricted
to one retry for 503; HTTP 429 is not automatically retried.
