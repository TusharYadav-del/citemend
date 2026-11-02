# Sitemap semantic matching (Days 29 and 30)

## Database activation

Use the existing Citemend Supabase project (the one configured by
NEXT_PUBLIC_SUPABASE_URL), not a newly created citefix-prod project.
Run supabase/migrations/009_pgvector_sitemaps.sql in its SQL Editor.
The repository already has migration 002; this forward migration preserves it.
The SQL enables vector, creates a server-only 768-dimensional sitemap_pages
table and a cosine-distance RPC. An optional query_model argument defaults to
gemini-embedding-001, preventing comparisons across model spaces.

Local verification executes the exact SQL in PostgreSQL with pgvector and tests
cosine ordering, threshold/count filtering, domain/model isolation, and public
access denial. The user confirmed hosted SQL application. Subsequent REST/vector/RPC checks verified the schema is active.


## Embeddings and indexing

The requested text-embedding-004 was shut down on January 14, 2026. The default
is the supported text-only gemini-embedding-001 with outputDimensionality 768;
one real request with the existing local Gemini key returned a finite 768-vector.
The citation probe remains Groq/Tavily. GEMINI_EMBEDDING_MODEL can explicitly
select an embedding model, but it must return one embedding per input string;
gemini-embedding-2 aggregates a list and is not a drop-in batch replacement.
Google's documentation:
https://ai.google.dev/gemini-api/docs/deprecations
https://ai.google.dev/gemini-api/docs/embeddings

Use the existing GEMINI_API_KEY, kept server-only, and optionally set
GEMINI_EMBEDDING_MODEL=gemini-embedding-001 in the server environment. No model
is assumed to have unlimited quota or zero cost for every account; provider
quota failures retain the existing matcher.

To index manually after applying migration 009:

```powershell
npm run dev:index-sitemap -- example.com
npm run dev
```

indexDomainSitemap in lib/seo.ts delegates to the server-only indexing service.
Discovery retains the existing sitemap/robots traversal and SSRF protection.
Selection deduplicates and caps URLs at 200, prioritizes core product/marketing
paths, excludes other hosts, query strings, administrative paths and assets,
and uses readable path keywords as page_title (not a fetched HTML title).

Embeddings are normalized finite nonzero vectors, requested in groups of 20.
Seven-day model-tagged cache entries are reused. Each batch is upserted by
(domain,url), so retries reuse successful batches without duplicate rows.
Changing models replaces each selected URL's cached vector and RPC queries
filter on model identity. Old/unselected rows can remain stored, but matches
must belong to the current selected sitemap before being suggested.

## Audit integration and confidence

Authenticated POST /api/audit uses the shared pipeline, as do weekly scans.
When a confirmed 404 exists and Gemini is configured, it indexes the selected
sitemap and embeds broken paths with RETRIEVAL_QUERY. Documents use
RETRIEVAL_DOCUMENT. Indexing and matching share a 30-second semantic budget;
each embedding request has a 10-second deadline and storage requests retain
the existing eight-second network budget. The route advertises a 300-second
platform duration, preserving the existing authenticated handler.

The RPC returns cosine similarity; the application accepts candidates at or
above 0.75, checks current sitemap membership and exact source hostname,
rejects self redirects, then verifies a live 2xx HTTP response. A similarity of
0.94 renders Match Confidence: 94% next to the suggested URL. This is cosine
similarity of URL keywords, not a calibrated probability or proof of equivalent
page content. The badge tooltip and table note make that distinction explicit.
Scores are measured, never fixed. Confidence is part of the current audit API
response; existing saved report/history schema remains unchanged and does not
persist these confidence percentages.

No match, low similarity, an unavailable model, quota exhaustion, or an unapplied
migration preserves the previous live-verified lexical matcher. Provider/storage
failures produce a generic report warning, and lexical suggestions have no
semantic confidence badge. No redirect is installed automatically.

## Verification boundaries

The SQL tests run real PostgreSQL/pgvector. Focused TypeScript tests exercise the
real Gemini SDK against controlled HTTP responses and cover malformed vectors,
partial batches, rate limits, network failure, batch size, cache reuse, URL/model
filtering, authenticated audit responses, live-candidate validation, and fallback.
The 94% scenario is a controlled fixture, not a claimed production score.
Hosted migration/readback and a real vector match were verified separately below.
The signed-in browser audit still requires an authenticated session.


Latest verification: all 112 unit/integration tests, npm run lint, and npm run
build passed with zero errors. The dev server started on port 3000. The initial hosted table check returned HTTP 404; after user-confirmed SQL application, server access returned HTTP 200 and public access HTTP 401. All seven browser regressions passed. A signed-in browser confidence result remains unverified. A live keyword
experiment returned similarities 0.6671 for pricing, 0.6014 for features, and
0.7756 for enterprise plans against old 2023 enterprise tier. This illustrates
why the 0.75 threshold does not guarantee the example pricing match or a 94% score.


Hosted verification after migration: 200 supabase.com vectors stored, a sampled
vector has 768 dimensions and gemini-embedding-001 identity. Initial indexing
hit provider quota after 120 saved rows; rerunning reused those rows and saved
80 more. The manual command now retries rate limits at most three times with
a one-minute pause; interactive audits keep their prompt fallback behavior.
A controlled pricing-old citation returned HTTP 404 and matched the live pricing
page at 76% through the real Gemini/hosted-RPC/live-check pipeline. This run used
local report mode and did not create a hosted audit. See day30-live-results.json.
