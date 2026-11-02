# Day 31 backend verification

The capsule API and citation-gap capture are implemented. See
CITATION_CAPSULES.md for the full contract and privacy model.

Migration 010 was applied by the user. A temporary isolated hosted audit and
metadata row verified saving, owner filtering and public denial (HTTP 401), then
were deleted by the temporary audit UUID and fixture owner. Existing rows were
not changed. No paid subscription or beta grant was created.

A live run scraped Ahrefs Brand Radar, extracted 1,500 words and page structure,
and used the approved gemini-3.6-flash fallback to return exactly 80 visible words,
a two-sentence structural insight, and valid FAQPage/Product JSON-LD. The
competitor URL was supplied manually for this test; this is not evidence of an
actual competitor ranking above Citemend. The generated draft remains subject
to fact review. See day31-live-capsule.json.

The active audit citation probe remains Groq/Tavily. Only answer-text URLs can
create saved gap evidence. Authentication and per-copy Pro checks are enforced
on the server, and free accounts receive no actual JSON-LD. Existing audit
persistence survives an optional metadata-save failure.

All 128 unit/integration tests passed. Lint and the production build passed with
zero errors. The OneDrive workspace required removal of a generated locked
.next/static build artifact before the last build; no source workaround was
introduced for that filesystem issue.
