# Week 3 integrity review and Week 4 Worker design

## Current system

The app has Clerk-protected audit creation and owner-scoped history, public
read-only reports, one free saved audit per account, a server-checked Pro
subscription, and Pro-only redirect exports. Lemon Squeezy checkout and signed
webhooks handle billing state. Supabase holds audits, confirmed 404 findings,
weekly scan jobs, and email digest logs. The scheduled audit probe uses the
active Groq/Tavily pipeline; Resend sends a digest for newly found 404s after
weekly jobs finish.

Code integrity checks for this review found no unused imports or lint
warnings in `app/` or `lib/`. There are no `console.warn`, `console.log`,
`debugger`, or unfinished placeholder comments in those directories. The one
`console.error` in the weekly route is a generic failure signal and exposes no
credentials. An untracked temporary live-probe script from an earlier check
was removed. No working previous-day feature needed a code rewrite.
The production build initially emitted a generated-cache compaction warning
on the OneDrive workspace. Clearing only `.next/cache` and rerunning produced
a clean build with zero errors or warnings.

Live deployment gaps are separate from code integrity: configure the Vercel
origin and billing webhook, activate the Supabase Edge relay and cron job, and
verify a real Pro weekly scan and inbox digest with a verified Resend sender.
The Day 20 development tests used a test-mode checkout, an in-memory signed
webhook and queue simulation, and Resend's test delivery address. They did
not create a paid Pro account or exercise a customer inbox.

## Proposed Cloudflare 404 listener for Week 4

1. **Installation and trust.** A customer opts in for a Cloudflare-proxied
   hostname they control. Register a Worker Route on that hostname, in front
   of its existing origin. Bind the installation to a verified owner and an
   explicit hostname allowlist. A public audit link alone must not claim a
   domain or authorize traffic collection. Keep the Worker ingestion token in
   a Cloudflare secret, not in the browser or Wrangler plaintext variables.
2. **Request path.** The Worker's `fetch` handler forwards the original
   request to the existing origin and returns its response unchanged. For
   `GET` and `HEAD` responses with status 404, emit a small observation event
   asynchronously. Preserve status, body, headers, and cache behavior;
   telemetry failure must never change the visitor's response. Label these
   as *edge-observed 404s*: a cached 404 is not proof of an origin failure.
3. **Event contract.** Include installation ID, normalized hostname and
   pathname, observed timestamp, HTTP status, and a random event ID. Exclude
   request bodies, cookies, authorization headers, full query strings, and
   visitor IPs. Bound path length and reject malformed hostnames. Do not label
   an observation as a ChatGPT or Perplexity citation unless it matches a
   separately saved citation URL from an audit.
4. **Delivery.** Put observations on a Cloudflare Queue, with retries and a
   dead-letter queue. The consumer sends bounded batches to a new authenticated
   CiteMend ingestion endpoint. Use a per-installation signing secret plus
   timestamp and replay protection; the endpoint checks active installation,
   owner, hostname, and Pro eligibility before its server-only Supabase write.
   Deduplicate by event ID and aggregate repeated `(installation, hostname,
   pathname, time window)` observations. Keep the Supabase service key out of
   the Worker.
5. **Dashboard and fixes.** Show observed 404 counts separately from the
   current AI citation audit findings. Join on normalized host and path to
   mark an observed 404 as a known cited URL. Reuse only verified same-domain
   replacement suggestions. The listener records events; it does not install
   redirects or change traffic without a separate explicit product action.
6. **Acceptance checks.** Verify 200, 301, 404, cached 404, HEAD, and origin
   timeout cases; check that failed ingestion leaves the visitor response
   intact, repeated events deduplicate, cross-domain and unsigned events are
   rejected, secrets never enter logs, and disabling an installation stops
   collection. Exercise the queue retry and dead-letter paths before rollout.

Cloudflare documents [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
for placing a Worker in front of an existing origin, [Worker context](https://developers.cloudflare.com/workers/runtime-apis/context/)
for background work, [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
for at-least-once processing, and [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
for credential storage. This is an architecture outline; no Worker or new
ingestion endpoint is deployed as part of Day 21.
