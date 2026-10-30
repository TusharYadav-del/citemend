# Week 1 retro

Tested on 2026-10-31. Scope: the local dashboard, live Groq/Tavily citation probe,
sitemap discovery, HTTP checks, redirect matching, Supabase save/read-back, and
frontend result rendering. No authentication implementation was started.

## Five real websites

| Domain | API | Citations checked | Confirmed 404s | Sitemap URLs | Result |
| --- | --- | ---: | ---: | ---: | --- |
| nextjs.org | 201 | 5 | 0 | 1,144 | Completed |
| stripe.com | 201 | 6 | 1 | 7,176 | Completed |
| vercel.com | 201 | 5 | 2 | 9,280 | Completed |
| supabase.com | 201 | 5 | 3 | 3,756 | Completed |
| github.com | 201 | 9 | 0 | 375 | Completed |

All five runs had live search evidence, no warnings, no unresolved HTTP checks,
and no browser runtime errors. All five saved audits were independently read
back from Supabase. All six confirmed 404 rows had a verified redirect
suggestion. These are observed results from this run, not permanent claims about
those websites. No redirects were deployed.

The machine-readable record, audit IDs, timings, and actual broken-link rows are
in [week1-live-results.json](./week1-live-results.json). The five audits remain
in the database. Screenshots are local, ignored files under `test-results/`.

## Bugs fixed

- A URL-only AI answer ending in sentence punctuation was treated as a literal
  URL, potentially creating a false 404. A regression reproduced this failure.
  Shared prose extraction now trims sentence/Markdown delimiters while preserving
  balanced parentheses and structured search URLs with query parameters.
- The dashboard accepted malformed findings and could crash while rendering a
  redirect. It now validates the fields it renders and shows a recoverable error.
- Numeric IP aliases could pass hostname validation and normalize to IP addresses
  later. They now fail input validation before any provider call.
- Request-size validation previously read the entire body before enforcing its
  limit. Oversized streams are now cancelled at 16 KiB; invalid UTF-8 is rejected.
- Active-provider rate limits now explain that the user should wait; network
  failures show a connection message. There are no automatic paid-request retries.

The active provider is Groq with Tavily search. The retained Gemini utility is
not called by the pipeline. Tests target the active provider's error path.

## Verification

- 19 provider/pipeline/API tests, 12 sitemap/status tests, and 3 dashboard helper
  tests pass.
- 7 browser tests pass: mobile/desktop layout, submit/copy, loading/duplicate
  prevention, rate limits, empty/healthy reports, malformed data, network errors,
  and a simulated 180-second browser timeout.
- The timeout test verifies that loading ends, controls recover, and the message
  explains that a server request might still be running. Unknown statuses never
  become invented 404s or perfect health scores.
- Final lint and production build both pass with zero errors.

## Week 2 authentication handoff

1. Add sign-in and session-aware browser/server clients. Verify identity on the
   server; never accept a client-supplied user ID as proof of ownership.
2. Add an audit owner reference in a new migration. Decide how existing demo and
   test audits are handled rather than assigning them to an arbitrary new user.
3. Add and test row-level policies for audits and child broken links, including
   cross-user read/write denial. RLS is enabled today, with no public policies.
4. Replace the local admin-backed flow with session-scoped access. Keep the
   current production POST restriction until authentication and ownership checks
   are verified. Never expose the server secret key to the browser.
5. Before public auditing, validate outbound destinations including redirect hops
   and resolved addresses. Current hostname checks are not a complete SSRF defense.
6. Decide how to persist full reports and buyer prompts for user history. The
   current schema stores audit status and broken-link rows; generated answers and
   grounding context are returned to the browser but not retained in these tables.

Provider quotas, host-specific HTTP restrictions, and sitemap size/time bounds
remain real operating limits. Partial reports disclose incomplete checks; they
are not silently converted into successful scans. Redirect rules are suggestions
for manual review, not deployed fixes.

## Follow-up readiness audit

The subsequent automated readiness audit adds outbound SSRF protection, typed
Supabase queries, bounded database requests, and transparent local/failed-save
reports. See [WEEK1_READINESS.md](./WEEK1_READINESS.md) for current behavior and
verification; the observations above describe the earlier Week 1 test run.
