# Week 1 Readiness Scorecard

Verified 2026-10-31 against the local Week 1 application. Checks were executed in
the requested order; failing cases were fixed and re-run. Authentication was not
implemented. Production audit POST remains deliberately disabled until Week 2.

| Check Name | Initial Status | Fixes Applied | Final Status |
| --- | --- | --- | --- |
| IDE / TypeScript / lint | Initially clean | Rechecked with strict TypeScript and zero-warning lint after all changes | PASS |
| Environment / secret security | Template gaps; 3 low dependency advisories | Documented all runtime variables; removed unused vulnerable shadcn CLI; scanned source, 14 commits, and compiled browser assets without printing keys | PASS |
| Groq / Tavily probe | Existing behavior passed; timeout/malformed-output coverage incomplete | Added timeout, 429, missing-key, punctuation, and malformed-output regressions; safe provider failures | PASS |
| Sitemap / HTTP checks | 30/10-second limits; unsafe outbound destinations | Eight-second budgets, browser-compatible UA, DNS-pinned public connections, private/mapped-IP and redirect protections; verified real HTTPS | PASS |
| Supabase / API integrity | Untyped queries; save failure discarded reports | SQL-matched types, bounded server requests, explicit saved/failed/local report states; real column and RLS verification | PASS |
| Dashboard edge cases | Private-domain and unsaved-state gaps | Early input rejection, consistent persistence labels, clipboard-denial handling; browser assertions for hydration and runtime errors | PASS |
| Production build / live smoke | Not yet verified for these fixes | Full tests, production build, public access checks, live API report and independent database read-back | PASS |

## Executed verification

- `npx tsc --noEmit`: exit 0.
- `npm run lint -- --max-warnings=0`: exit 0; no warnings.
- `npm run test:audit`: 25 passing tests.
- `npm run test:seo`: 15 passing tests.
- `npm run test:security`: 4 passing tests, including a real connection rejected
  when DNS resolves to a private address.
- `npm run test:dashboard`: 4 passing tests.
- `PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:ui`: 10 passing tests;
  no hydration warnings or browser runtime errors.
- `npm run build`: exit 0, TypeScript compilation and prerendering completed.
- `npm audit --audit-level=low`: zero known vulnerabilities.
- `node scripts/check-env-security.mjs --build`: no configured key values in
  source/history or private keys in browser assets; `.env.local` ignored and
  never tracked in the inspected history.

Live smoke: dashboard -> Groq/Tavily -> secured sitemap/status requests ->
Supabase -> dashboard. HTTP 201, completed status, 13 citations, 5 confirmed 404s,
1,144 sitemap URLs, and no warnings. The saved audit and five child rows were
independently read back. Evidence: [readiness-live-results.json](./readiness-live-results.json).

Real database checks confirmed both table column sets and valid public-key
access. An anonymous insert was denied with PostgreSQL code 42501. Production
homepage and setup GET returned 200; production POST returned 403. The production
dashboard remained disabled for live submissions and hydrated without errors.

## Behavior changes and operational boundaries

- Database failures preserve computed results with HTTP 200, null auditId,
  partial status, warnings, and `persistence.status = failed`. No successful save
  is claimed. `AUDIT_PERSISTENCE_MODE=local` intentionally skips database writes
  and reports disabled persistence. Verified saved reports still return 201.
- Sitemap and individual status operations now have eight-second overall abort
  budgets. Existing traversal and body-size bounds remain. Timeout/fetch failures
  are disclosed rather than converted into invented 404s.
- Outbound requests reject private/reserved IPs, private DNS answers, credentials,
  and nonstandard ports. Each redirect is screened; connection lookup uses the
  exact checked DNS addresses to prevent a second unchecked resolution.
- The compatible HTTP agent requires Node >=20.18.1, now recorded in package.json
  and README. Verification used Node v26.13.0 and undici 7.30.1.
- The shadcn components remain installed as source. The unused shadcn CLI runtime
  dependency, which introduced the three advisories, was removed. Future component
  generation can still use `npx shadcn@latest`.
- This is readiness for Week 2 authentication work. Existing server-side API
  restrictions and row-level security have not been relaxed.

Changes are local for review. Existing unrelated AGENTS.md and script-approval
settings were preserved; this audit did not create a commit or publish changes.
