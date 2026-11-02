# Citation gaps and Citation Capsules (Days 31 and 32)

## What is measured

The active citation probe remains Groq/Tavily. A citation gap is recorded only
when a generated answer contains external HTTP(S) links and neither mentions
the target domain nor cites that domain or its subdomains. Search-only sources
are not evidence of a recommendation. Up to five answer URLs are retained.
External sources may be competitors, references, or publishers; the interface
asks the user to review them. This is not a ranking or a verified causal account
of why ChatGPT, Gemini, or another model selected a page.

Migration 010_audit_citation_gaps.sql adds a separate server-only table. The user
confirmed its hosted application. A temporary hosted fixture verified save/read,
another owner received no results, public access returned HTTP 401, and the
fixture was removed by deleting only its temporary parent audit. Core audit
saves remain usable if optional gap evidence cannot be saved; the current report
shows an explicit warning. Historical audits without evidence do not acquire
invented competitors. No old audit or billing behavior is replaced.

## API

POST /api/capsule accepts authenticated JSON:

```json
{
  "domain": "citemend.vercel.app",
  "buyerPrompt": "How can a founder identify broken AI citation links?",
  "competitorUrl": "https://ahrefs.com/brand-radar"
}
```

The route uses the existing Clerk session and server-only Gemini key. It reads
at most 24 KiB with a five-second upload deadline. Private addresses, credentials,
ports and owned-domain competitors are rejected. HTML retrieval uses the existing
DNS-pinned public-fetch helper, a browser User-Agent, bounded redirects, a
10-second source deadline, and a 2 MiB body limit. Every redirect is checked.
Non-HTML, blocked, tiny, or client-rendered-only pages return a clear error.

Cheerio extracts H1, up to 12 H2s, eight FAQ question/answer pairs, 12 paragraph
samples, table headers, JSON-LD type names, and at most 1,500 words of main text.
Executable, hidden and navigational content is removed. It does not claim that
a specific paragraph was the model's actual retrieval source. The user's own
homepage supplies separate bounded factual evidence where available. The prompt
forbids importing competitor claims or inventing target features/prices.

The requested gemini-2.5-flash returned HTTP 404 for the current key. The user
approved gemini-3.8-flash and an explicit gemini-3.6-flash fallback. Set
GEMINI_CAPSULE_MODEL and GEMINI_CAPSULE_FALLBACK_MODEL as needed; set the fallback
to none to disable it. Only unavailable/gateway responses trigger one fallback;
quota errors are returned without a retry storm. Generation has a 90-second overall deadline, 25-second model request limits, and a 120-second route allowance. The actual model is returned
and displayed. Gemini 3 uses LOW thinking for this bounded drafting task.
Google's current lifecycle page is https://ai.google.dev/gemini-api/docs/deprecations.

The provider returns structured text, validated as exactly 80 single-word tokens,
an exactly two-sentence insight, and one to three FAQ pairs. Numbered word01-through-word80 slots make the word count explicit; one bounded model repair is allowed on invalid output. A draft is never silently truncated or padded. Trusted code constructs semantic escaped
section HTML and a syntactically valid FAQPage/Product JSON-LD script. AI markup
is never executed. JSON-LD escapes script-closing characters. Treat both outputs
as drafts: verify target claims, publish matching visible FAQ answers, and use
Product schema only for a real offering. No citation or rich-result guarantee
is made. Product prices, reviews and ratings are never fabricated by the renderer.

## Pro export

Free signed-in accounts can generate and copy the HTML. They receive no actual
JSON-LD schema; the blurred preview is a generic example. The hidden schema is
carried in an AES-256-GCM encrypted, owner-bound token expiring after 15 minutes.
CAPSULE_SIGNING_SECRET is optional; otherwise the key is purpose-derived from
the server Clerk secret. No browser key or plaintext schema is placed in that
token. Token decryption requires integrity, matching user, and unexpired time.

Every Copy JSON-LD action calls the same endpoint with:

```json
{ "action": "export-jsonld", "exportToken": "the-opaque-token" }
```

The server rechecks lib/subscription.ts, including active beta access. Free
accounts receive HTTP 403 and the existing upgrade dialog. Expired, tampered or
other-owner tokens fail; schema export never calls Gemini again. All API
responses use private, no-store caching. Subscription failures fail closed.

## UI and privacy

The shadcn Dialog, Tabs and Textarea power CitationCapsuleModal. It opens from
the requested Win This Citation button, shows an amber structural insight,
loading/errors/retry, HTML code and a sandboxed/CSP-restricted live preview,
JSON-LD code or a generic locked preview, clipboard feedback, cancellation,
keyboard dismissal and responsive wrapping.

The signed-in workspace and fresh audit results show qualifying gaps. Shareable
reports show the action only to the audit owner after server-side evidence lookup.
Buyer prompts and competitor evidence are not added to the anonymous public-report
payload. Signed-out generation returns HTTP 401. Public report findings and
existing redirect exports retain their behavior.

## Verification

Unit/integration coverage includes HTML parsing, SSRF/redirect/body limits,
unsafe generated strings, word-count enforcement, authentication, Pro gating,
encrypted owner/expiry/tamper checks, provider fallback, stalled uploads, gap
detection, optional-save failure isolation, and real PostgreSQL migration execution.

Browser component fixtures mount the real modal and mock only auth/router context
and API responses; they cover tabs, sandboxed preview, both copy actions, upgrade,
retry/mobile behavior and Escape. The existing app suite covers anonymous pages,
auth guards and the real capsule route. These are distinct from an authenticated
live browser session; no production session is impersonated or manufactured.


A live test retrieved Ahrefs Brand Radar and generated an 80-word HTML capsule
and valid FAQPage/Product script using the approved gemini-3.6-flash fallback.
See day31-live-capsule.json for the generated draft and a bounded source summary.
It is a manual API scenario, not proof that an audit actually ranked that source
above Citemend. The existing citation probe remains unchanged.
