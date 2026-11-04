# CiteMend Repository Truth Audit

**Scope:** repository inspection for Days 85–88 (Phase 0 and Phase 1). Status reflects code present in this checkout and checked behavior; it does not claim external provider, hosted Supabase, Vercel, or Shopify production state unless explicitly stated.

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
| Pixel 404 interception, rescue telemetry, installer, quota | `lib/pixel-intercept.ts`, `public/citemend-pixel.js`, migrations 017–020 | Shipped; new hosted approval migration remains to be applied/verified |
| Redirect export and platform sync | `lib/redirect-export.ts`, `lib/redirect-sync.ts`, sync route, redirect rules; destinations rechecked as exact HTTP 200 at export/sync time | Shipped; actual external deployment is customer-managed; Shopify live credentials need verification |
| Redirect approval, signed preview, confidence threshold, manual mapping, rollback | `lib/recovery-workflow.ts`, `lib/recovery-policy.ts`, migration 020, recovery routes and dashboard controls | Shipped in code; hosted migration application needs verification |
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
| `POST /api/recovery/approve` | Clerk owner-scoped preview/approval; requires HTTP 200; scores below 70 are rejected; medium/unscored require explicit confirmation | Shipped in code; migration 020 needs hosted application |
| `POST /api/recovery/rollback` | Owner-scoped local rule disable/restore; removes tracked Shopify redirect IDs; refuses untracked remote rollback | Shipped in code; remote Shopify permissions need verification |
| `POST /api/redirect-export` | Authenticated paid export with same-domain safety checks | Shipped |
| `POST /api/redirect-rules` | Owner-scoped edge rule toggle; activation requires approved/deployed eligible recovery | Shipped |
| `POST /api/redirects/sync` | Authenticated paid Shopify sync/export; filters to approved/deployed eligible suggestions | Shipped; Shopify Admin API access needs verification |
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
| `citation_hijack_opportunities` | Competitor/listicle recovery opportunities and verification status | Shipped |
| `rescued_ai_visits` | Rescued visitor telemetry | Shipped |
| `workspace_integrations` | Shopify, Slack/Discord, and agency settings | Shipped |
| `pixel_intercept_quotas` | Atomic per-domain interceptor quota | Shipped |

Migration files are numbered 001–020 and the local schema test applies them in order, then compares TypeScript row fields and SQL nullability. Migrations 001–019 were previously recorded as applied/locally verified in `PLAN.md`; migration 020 is new in this task and has not been applied to the hosted Supabase project by this repository audit.

## Security and operational checks

| Check | Finding | Status |
| --- | --- | --- |
| Clerk authentication | Dashboard routes are protected by Clerk middleware and verify the session again server-side. Audit, capsule, subscription, settings, and recovery handlers enforce authenticated user ownership. Public reports and pixel endpoints are intentionally public. | Shipped |
| Supabase RLS | RLS is enabled across the audited application tables. Application reads/writes use the server-only service key and enforce Clerk owner/domain filters. `redirect_rules` public access is now additionally filtered by a security-definer approval predicate; telemetry/integration/vector tables revoke anon/authenticated access. A complete hosted role/grant and policy audit cannot be inferred from local files alone. | Needs Verification (hosted grants/policies) |
| SSRF protection | `lib/public-http.ts` rejects non-HTTP(S), credentials, non-standard ports, private/loopback/link-local DNS results and pins public DNS results in its Undici connection. SEO/sitemap redirects are manually followed with each hop revalidated and bounded. Recovery additionally requires a same-domain HTTPS destination and an exact HTTP 200 preview. | Shipped |
| Rate limits | Pixel interception uses migration 019's atomic limit of 120 requests per audited domain per minute. Free audit reservations and weekly leases prevent duplicate/free overuse. There is no shared per-user limiter across all authenticated AI/provider routes; production traffic limits should be verified/configured at the platform/provider layer. | In Progress |
| Webhook signature verification | Lemon Squeezy inbound subscription events require bounded payloads and constant-time HMAC-SHA256 signature verification. Weekly cron uses a separate constant-time bearer-secret check. Slack/Discord are outbound webhooks; no inbound Slack/Discord signature route exists. | Shipped (Lemon Squeezy/cron); other inbound providers not present |
| New approval lifecycle | Migration 020 is additive; legacy 404s are backfilled as `url_state='404'` and stay `pending_review`. Similarity below 70 is manual-only; owners must supply a destination, preview HTTP 200, and confirm a signed, five-minute, owner/link/destination-bound preview token. Pixel redirects require approved/deployed status and score >=70; 301 sync requires approval. Shopify rollback is available only when a remote redirect ID has been recorded. | Shipped in code; hosted schema needs verification |
| External production state | This inspection did not make live provider calls or inspect Vercel, Shopify, Clerk, Lemon Squeezy, or hosted Supabase dashboards. Day 84 records the Agency variant as pending/test-mode. | Needs Verification |
