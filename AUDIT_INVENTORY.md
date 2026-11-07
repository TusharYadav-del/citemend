# CiteMend Repository Truth Audit

**Scope:** repository inspection for Days 85â€“88 (Phase 0 and Phase 1). Status reflects code present in this checkout and checked behavior; it does not claim external provider, hosted Supabase, Vercel, or Shopify production state unless explicitly stated.

## Feature inventory

| Feature | Evidence in repository | Status |
| --- | --- | --- |
| Marketing site, shared design tokens, responsive dashboard UI | `app/page.tsx`, `app/dashboard/page.tsx`, `app/globals.css`, `components/ui/*`, `lib/design-tokens.ts` | Shipped |
| Clerk sign-in, protected dashboard, owner-scoped audit history | `proxy.ts`, dashboard server auth, `lib/audit-handler.ts`, owner filters in `lib/audit-history.ts` | Shipped |
| Groq/Tavily citation probe, sitemap parsing, URL checks, report persistence | `lib/citation-probe.ts`, `lib/seo.ts`, `lib/public-http.ts`, `lib/audit-pipeline.ts`, `lib/audit-store.ts` | Shipped |
| Public shareable audit report, citation gaps, capsules | `lib/public-audit.ts`, `lib/citation-gap-store.ts`, `lib/citation-capsule.ts`, report and capsule routes | Shipped |
| Four-profile engine matrix and Share of Model | `lib/engine-matrix.ts`, `lib/engine-synthesis.ts`, saved audit matrix fields | Shipped |
| Semantic sitemap indexing and citation matching | `lib/sitemap-embeddings.ts`, migration 009 | Shipped; live Gemini credentials/provider behavior needs verification |
| Competitor 404 hijacker, listicle crawler, entity pricing truth | `lib/hijacker.ts`, `lib/listicle-crawler.ts`, `lib/entity-truth.ts` | Shipped; provider and target-site behavior needs verification |
| Pixel 404 interception, rescue telemetry, installer, quota | `lib/pixel-intercept.ts`, `public/citemend-pixel.js`, migrations 017-021 | Shipped; user confirmed hosted migration 021 was applied |
| Redirect export and platform sync | `lib/redirect-export.ts`, `lib/redirect-sync.ts`, sync route, redirect rules; destinations rechecked as exact HTTP 200 at export/sync time | Shipped; actual external deployment is customer-managed; Shopify live credentials need verification |
| Redirect approval, signed preview, confidence threshold, manual mapping, rollback, canonical/loop/conflict safety and immutable action events | `lib/recovery-workflow.ts`, `lib/recovery-policy.ts`, `lib/seo.ts`, migrations 020/021 and recovery/sync routes | Shipped in code; user confirmed hosted migration 021 was applied |
| Slack/Discord alerts and weekly scans | `lib/alerts.ts`, `lib/weekly-alerts.ts`, `lib/weekly-scan.ts` | Shipped; saved webhook delivery and scheduled production invocation need verification |
| Agency white-label reports and workspace switching | `lib/agency-store.ts`, `lib/agency-whitelabel.ts`, settings route, audit report/dashboard | Shipped; live agency billing variant remains unverified in Day 84 record |
| Lemon Squeezy checkout and signed subscription updates | `lib/lemonsqueezy.ts`, `lib/lemonsqueezy-webhook.ts`, webhook route | Shipped; live product, webhook configuration, and completed live purchase need verification |
| Local fallback/mock audit | `lib/mock-audit.ts`, `lib/mock-audit-store.ts`, test fixture | Shipped as a development/test path; production availability is intentionally restricted |

## API route inventory

| Route | Purpose and observed boundary | Status |
| --- | --- | --- |
| `POST /api/audit` | Clerk-authenticated; free reservation or paid entitlement; bounded request; provider probe and owner-scoped persistence | Shipped |
| `GET /api/audit` | Existing compatibility/readiness response | Shipped |
| `POST /api/preview` | Public bounded homepage/sitemap preview using URL safety checks | Shipped |
| `POST /api/beta-request` | Beta request and invitation workflow | Shipped |
| `POST /api/capsule` | Clerk-authenticated; paid gating for full export; bounded generation/token output | Shipped |
| `POST /api/hijack-pitch` | Authenticated opportunity lookup and saved draft | Shipped |
| `GET,POST /api/cron/weekly-scan` | Requires configured bearer secret; token comparison is timing-safe; leased jobs prevent duplicate work | Shipped |
| `GET,POST /api/integrations/shopify/connect` | Authenticated, owned-domain scoped integration setup | Shipped; live OAuth/store flow needs verification |
| `POST /api/integrations/shopify/sync` | Authenticated domain integration sync | Shipped; remote store permissions need verification |
| `POST /api/lemonsqueezy/checkout` | Clerk-owned checkout and configured variant | Shipped; live billing configuration needs verification |
| `GET /api/subscription/status` | Clerk-scoped subscription state | Shipped |
| `POST /api/webhooks/lemonsqueezy` | Bounded raw body; HMAC-SHA256 `x-signature` checked with constant-time comparison; owner/store/product validation | Shipped; production secret and live webhook delivery need verification |
| `GET /api/llm-facts` | Generates machine-readable factual metadata using stored owner/domain evidence | Shipped; publicly deployed domain configuration needs verification |
| `GET /api/llms-txt`, `GET /api/llms-txt/[domain]` | Authenticated generation or public stored document retrieval, respectively | Shipped |
| `GET /api/pixel/dashboard` | Clerk-scoped rescue and redirect metrics | Shipped |
| `GET,POST,OPTIONS /api/pixel/intercept` | Intentionally public CORS endpoint; audited-domain quota is atomically limited to 120 requests/minute; only approved live 404 mappings with score >=70 auto-redirect | Shipped; migration 020 must be live before this new query is deployed |
| `GET /api/pixel/resolve` | Public edge resolver accepts only approved, live broken-link mappings with score >=70; it no longer auto-creates rules from fresh semantic matches | Shipped; edge deployment configuration needs verification |
| `POST /api/prompts/suggest` | Authenticated prompt suggestions with bounded inputs | Shipped |
| `POST /api/recovery/approve` | Clerk owner-scoped preview/approval; requires HTTP 200; scores below 70 are rejected; medium/unscored require explicit confirmation | Shipped in code; user confirmed hosted migrations 020 and 021 were applied |
| `POST /api/recovery/rollback` | Owner-scoped local rule disable/restore; removes tracked Shopify redirect IDs; refuses untracked remote rollback | Shipped in code; remote Shopify permissions need verification |
| `POST /api/opportunities/lifecycle` | Clerk-authenticated; audit-owner scoped; sequential six-stage advancement with timestamped notes and weighted-signal score | Shipped in code; user confirmed hosted migration 021 was applied |
| `POST /api/redirect-export` | Authenticated paid export with same-domain safety checks | Shipped |
| `POST /api/redirect-rules` | Owner-scoped edge rule toggle; activation requires approved/deployed eligible recovery | Shipped |
| `POST /api/redirects/sync` | Authenticated paid Shopify sync/export; rechecks source 404, canonical host, redirect chain, conflicts, and destination health; writes action logs | Shipped; user confirmed migration 021, Shopify Admin API access needs verification |
| `GET,POST /api/settings/whitelabel` | Owner and paid-plan scoped white-label settings | Shipped |
| `GET,POST /api/verify-fix` | Authenticated re-verification and IndexNow request workflow | Shipped |
| `GET,POST /api/workspace/integrations` | Owner/domain-scoped webhook and integration settings | Shipped |

## Database inventory

| Public table | Purpose | Status |
| --- | --- | --- |
| `audits` | Owner-scoped audit reports, matrix, score, billing/report metadata | Shipped |
| `broken_links` | Citation URL findings and suggested redirects; migration 020 adds verification, confidence and approval lifecycle fields | Shipped in code; hosted migration 020 needs verification |
| `subscriptions` | Lemon Squeezy subscription entitlement | Shipped |
| `weekly_scan_runs` | Weekly run leases and status | Shipped |
| `weekly_scan_jobs` | Per-owner/domain scheduled audit jobs | Shipped |
| `weekly_scan_digests` | Idempotent user digest tracking | Shipped |
| `redirect_rules` | Owner-managed edge redirect rules and telemetry compatibility fields; migration 020 adds Shopify remote ID tracking and public RLS approval filtering | Shipped in code; hosted migration 020 needs verification |
| `sitemap_pages` | Domain sitemap pages and pgvector embeddings | Shipped |
| `audit_citation_gaps` | Owner-scoped prompt/citation gap evidence | Shipped |
| `ai_404_events` | Pixel/edge 404 event telemetry | Shipped |
| `cms_connections` | CMS connection metadata | Shipped; remote connections need verification |
| `action_audit_logs` | Append-only redirect preview/approval/rejection/deployment/rollback and redirect export records; service-role-only | Shipped in code; user confirmed hosted migration 021 was applied |
| `citation_hijack_opportunities` | Competitor/listicle opportunities with six lifecycle stages and four 0-100 ranking signals | Shipped in code; user confirmed hosted migration 021 was applied |
| `rescued_ai_visits` | Rescued visitor telemetry | Shipped |
| `workspace_integrations` | Shopify, Slack/Discord, and agency settings | Shipped |
| `pixel_intercept_quotas` | Atomic per-domain interceptor quota | Shipped |
| `background_jobs` | Tenant-scoped idempotent queued work, leases, chunk progress, retries, and safe result status | Shipped in code; apply migration 032 to hosted Supabase |
| `founder_weekly_scorecards` | Founder-only weekly Section 9 operating target inputs | Shipped in code; apply migration 032 to hosted Supabase |

Migration files are numbered 001-032 and the local schema test applies them in order, then compares TypeScript row fields and SQL nullability. The user confirmed hosted application of migrations through 031 during the roadmap work. Migration 032 passed local ordered schema/queue tests but still needs to be applied to hosted Supabase before deploying the background queue worker and founder scorecard storage.

## Security and operational checks

| Check | Finding | Status |
| --- | --- | --- |
| Clerk authentication | Dashboard routes are protected by Clerk middleware and verify the session again server-side. Audit, capsule, subscription, settings, and recovery handlers enforce authenticated user ownership. Public reports and pixel endpoints are intentionally public. | Shipped |
| Supabase RLS | RLS is enabled across the audited application tables. Application reads/writes use the server-only service key and enforce Clerk owner/domain filters. `redirect_rules` public access is filtered by a security-definer approval predicate; telemetry, integrations, vectors, and action audit logs revoke anon/authenticated access. A complete hosted role/grant and policy audit cannot be inferred from local files alone. | Needs Verification (hosted grants/policies) |
| SSRF protection | `lib/public-http.ts` rejects non-HTTP(S), credentials, non-standard ports, private/loopback/link-local DNS results and pins public DNS results in its Undici connection. SEO/sitemap redirects are manually followed with each hop revalidated and bounded. Recovery additionally requires a same-domain HTTPS destination and an exact HTTP 200 preview. | Shipped |
| Rate limits | Pixel interception uses migration 019's atomic limit of 120 requests per audited domain per minute. Free audit reservations and weekly leases prevent duplicate/free overuse. There is no shared per-user limiter across all authenticated AI/provider routes; production traffic limits should be verified/configured at the platform/provider layer. | In Progress |
| Webhook signature verification | Lemon Squeezy inbound subscription events require bounded payloads and constant-time HMAC-SHA256 signature verification. Weekly cron uses a separate constant-time bearer-secret check. Slack/Discord are outbound webhooks; no inbound Slack/Discord signature route exists. | Shipped (Lemon Squeezy/cron); other inbound providers not present |
| Recovery safety and action history | Migrations 020/021 are additive; approval checks enforce canonical-host URLs, a non-looping same-host redirect chain, no live HTTP 200 source overwrite, no conflicting active source rule, and a final HTTP 200 destination. Action rows are append-only and service-role-only. | Shipped in code; user confirmed hosted migration 021 was applied |
| Opportunity lifecycle guardrails | API stages advance one step at a time and keep actor/time/note events; scores use equal 25% weights for relevance, buyer intent, citation evidence, and replacement quality. Outreach and Reddit content remain human-reviewed drafts. | Shipped in code; user confirmed hosted migration 021 was applied |
| External production state | This inspection did not make live provider calls or inspect Vercel, Shopify, Clerk, Lemon Squeezy, or hosted Supabase dashboards. Day 84 records the Agency variant as pending/test-mode. | Needs Verification |

## Month 12 additions

| Feature | Evidence | Status |
| --- | --- | --- |
| Workspace operating metrics and founder aggregates | `lib/operating-metrics.ts`, `app/api/metrics/operating/route.ts`, workspace metrics dashboard components, migration 028 | Shipped; telemetry is workspace owner-scoped; user confirmed hosted migration 028 |
| Dynamic model profiles | `lib/model-registry.ts`, `lib/citation-probe.ts`, `lib/engine-synthesis.ts`, `lib/engine-matrix.ts` | Shipped; profile simulation/native-provider limitations are explicitly exposed |
| Gross margin estimator | `lib/model-registry.ts`, `lib/operating-metrics.ts` | Enabled with conservative default assumptions and per-profile environment overrides; estimate excludes infrastructure, payment fees, and unmetered usage |

### Configured model-call cost assumptions

These are upper-budget planning estimates per buyer-prompt profile call, not measured provider bills. Current displayed profiles use shared search plus Groq simulations for Perplexity Sonar and Claude. ChatGPT Search's estimate includes one basic Tavily search; Gemini uses the native Gemini paid rate effective January 2027 even when its Groq fallback is active. Operators can override each number using the four `CITEMEND_MODEL_COST_*_USD_PER_CALL` variables in `.env.example`.

| Profile | Default USD/call | Basis |
| --- | ---: | --- |
| ChatGPT Search | $0.012 | Groq GPT-OSS 120B bounded-token budget plus one Tavily basic-search credit |
| Perplexity Sonar (simulated) | $0.001 | Rounded-up Groq GPT-OSS 20B bounded-token budget |
| Google Gemini | $0.014 | Rounded-up 4,000 input / 1,000 output token budget at announced Jan 2027 Gemini 3.8 Flash standard rates |
| Claude (simulated) | $0.001 | Rounded-up Groq GPT-OSS 20B bounded-token budget |

Pricing references: [Groq GPT-OSS 120B](https://console.groq.com/docs/model/openai/gpt-oss-120b), [Groq GPT-OSS 20B](https://console.groq.com/docs/model/openai/gpt-oss-20b), [Tavily pricing](https://www.tavily.com/pricing), and [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing). The gross-margin percentage subtracts estimated model/search spend from the current plan's monthly price; it is not accounting gross margin or recognized revenue.

## Final 12-Month Roadmap Completion Scorecard

The score is for repository implementation and automated QA, not customer production rollout. A 100% shipped/tested mark means the scoped code is present and the final repository-wide checks below pass. It does not override historical live provider, hosted migration, billing, account, or deployment checks marked pending in this file or `PLAN.md`.

| Month | Roadmap scope recorded in `PLAN.md` | Repository status | Automated QA |
| --- | --- | --- | --- |
| 1 | Days 1-20: setup, audit foundation, authentication, billing and first retrospectives | 100% shipped | Final suite passed |
| 2 | Days 21-40: edge recovery, telemetry, alerts and weekly scans | 100% shipped | Final suite passed |
| 3 | Days 41-60: launch experience, integrations, onboarding and batch QA | 100% shipped | Final suite passed |
| 4 | Days 61-80: engine matrix, visibility and workspace dashboard capabilities | 100% shipped | Final suite passed |
| 5 | Days 81-100: recovery safety, redirect approval and opportunity workflows | 100% shipped | Final suite passed |
| 6 | Days 101-120: evidence, integrations, forensics and intelligence graph | 100% shipped | Final suite passed |
| 7 | Days 121-130: controlled autonomous recovery agents | 100% shipped | Final suite passed |
| 8 | Days 131-140: ecommerce catalog and SKU recovery | 100% shipped | Final suite passed |
| 9 | Days 141-150: enterprise workspaces and governance | 100% shipped | Final suite passed |
| 10 | Days 151-160: Public API, MCP and evidence distribution | 100% shipped | Final suite passed |
| 11 | Days 161-170: citation change and predictive intelligence | 100% shipped | Final suite passed |
| 12 | Days 171-180: operating metrics, model registry and master QA | 100% shipped | Final suite passed |

**Repository score: 12/12 roadmap months and Sprints 1–11 (Days 1–365) implemented and tested.** Remaining live checks are operational prerequisites, not silently included in this score: earlier plan entries identify pending billing/webhook activation, signed-in or provider checks, hosted migration 032, and live Shopify/Cloudflare behavior. Annual plans are priced with estimated-cost floors, but provider variants are not configured by this code. Cost defaults are enabled; set `CITEMEND_MODEL_COST_*_USD_PER_CALL` and `CITEMEND_ESTIMATED_INFRA_COST_PER_AUDIT_USD` to match measured usage or provider invoices.

### Final master QA run (2026-11-07)

- `npx tsc --noEmit`: pass.
- `npm run lint`: pass with zero errors; two existing unused-parameter warnings remain in `app/layout.tsx`.
- `npm test`: pass (264 tests; includes five end-to-end First 30-Day Definition of Done checks).
- `npm audit --omit=dev`: pass, zero production dependency vulnerabilities.
- `npm run build`: pass (`.next-sprint11`, isolated output directory).

Sprint 10/11 additions are covered by `lib/job-queue-core.ts`, `lib/job-queue.ts`, `lib/background-job-processor.ts`, `app/api/jobs/`, `app/api/cron/background-jobs/`, `lib/billing.ts`, `lib/unit-economics.ts`, `lib/founder-os.ts`, `/dashboard/founder-os`, migration 032, and `tests/definition-of-done.test.ts` / `tests/sprint10-11-foundation.test.ts`. Annual plan prices and gross-margin guardrails are estimates; new Lemon Squeezy variants remain to be configured. The user has not yet confirmed hosted migration 032 application.
