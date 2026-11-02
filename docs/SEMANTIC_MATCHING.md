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
access denial. Hosted application remains pending until confirmed separately.
