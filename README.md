# CiteMind

Day 1 repository and environment setup. The starter page is unchanged.
The audit endpoint is a setup check only; no real audit, authentication,
payments, or database integration is implemented.

## Requirements

- Node.js 20.9 or newer (an active LTS release is recommended)
- npm

## Installation

In VS Code, choose **File > Open Folder** and select this project's `citemend`
folder (the folder containing `package.json`). Choose **Terminal > New Terminal**.
Run all commands below in that terminal.

First, check that Node.js and npm are installed:

```sh
node --version
npm --version
```

Both commands should print a version. Node.js must be at least 20.9. If either
command is not found, install Node.js LTS (which includes npm), restart VS Code,
and open a new terminal.

Install the locked dependencies (this step needs network access):

```sh
npm ci
```

The Day 1 starter runs without environment variables. `.env.example` documents the current
setup. Future local credentials belong in `.env.local`, which Git ignores.
Never commit real credentials to `.env.example`.

## Development

```sh
npm run dev
```

Open http://localhost:3000. If port 3000 is occupied, use the URL printed
in the terminal. Seeing the default Next.js starter page means setup succeeded.
Keep this terminal running while using the app. Open another terminal for other
commands, or stop the server with Ctrl+C.

## Verify the placeholder API

Open http://localhost:3000/api/audit (adjust the port if necessary).
A GET request should return HTTP 200 with:

```json
{"status":"ok","message":"CiteMind audit API placeholder"}
```

This response confirms routing works; it does not audit submitted content.

## Lint

```sh
npm run lint
```

## Production build

```sh
npm run build
```

The app uses system fonts, so the build does not download Google fonts.

To serve the finished production build:

```sh
npm run start
```

## Project layout

- `app/`: Next.js App Router pages and styles
- `app/api/audit/route.ts`: placeholder GET endpoint
- `components/`: reserved for UI components; `.gitkeep` tracks the empty folder
- `lib/supabase.ts`: Supabase client configured with public project environment variables
- `.env.example`: credential-free environment guidance

TypeScript, ESLint, and the existing Tailwind CSS 4 setup are retained.
`lucide-react` is installed for future icons. Tailwind is configured through
`app/globals.css` and the existing Turbopack loader in `next.config.ts`;
no additional Tailwind configuration file is needed.

## Recovery

Ask Codex to inspect and undo the specific broken change.

A hard reset discards uncommitted tracked work.

## Day 2: Supabase database

1. In Supabase, create a free project named `citemend`. Choose your nearest
   available region and store the database password in your password manager.
2. In the project's API settings or Connect dialog, copy the project URL and
   public publishable key into `.env.local` (already ignored by Git):

   ```ini
   NEXT_PUBLIC_SUPABASE_URL=your_project_url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_public_publishable_key
   ```

   Never use a `service_role` or secret key in a `NEXT_PUBLIC_` variable.
   Legacy projects may use `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead. Restart the development server after changing these values.
3. Open **SQL Editor > New Query**, paste `supabase/migrations/001_init.sql`,
   and click **Run** once. The migration is transactional and expects new tables;
   do not rerun it after success.
4. Confirm `audits` and `broken_links` exist in the Table Editor. In the SQL
   Editor, check the columns and the audit relationship with:

   ```sql
   select * from public.audits limit 1;
   select * from public.broken_links limit 1;
   ```

The migration supplies UUIDs and creation timestamps automatically. Broken links
reference an audit and are deleted when that audit is deleted. A redirect may
remain null until one is suggested.

Row level security is enabled with no public access policies. SQL Editor access
works, but the public client cannot read or write audit rows yet. Authentication
and ownership policies are outside Day 2. No database call has been added to the
starter page or placeholder API.

After configuration, application code can import `{ supabase }` from
`@/lib/supabase`. Importing it without both environment variables gives a clear
configuration error. A successful app build alone does not verify the hosted
schema or credentials.

## Day 3: Mock audit workspace

Live Gemini calls are paused at the user's request. Run `npm run dev` and open
`/dev/citation-probe` to use the mock frontend. Generate a report to see citation
cards, simulated 404 findings, suggested redirects, and the fixed JSON response.
No search or HTTP scan is performed. The fixture lives in
`lib/fixtures/mock-audit.json`; changing the domain only personalizes sample URLs.

To save the report, add `SUPABASE_SECRET_KEY=...` to ignored `.env.local`, using
the project's server-only secret key, then restart the development server.
Never prefix this key with `NEXT_PUBLIC_`. Click **Save mock audit** to insert an
audit and its broken links, then read them back through the foreign-key relation.
The status is `mock_completed`; real findings are never implied. Citations remain
in the preview because the existing schema stores only audits and broken links.
A failed partial save attempts to remove only the newly created mock audit.

This unauthenticated demo and its database actions are development-only; row
level security stays enabled. A production build returns 404 for this route.
The existing starter homepage, placeholder API, schema, and public client remain.

With the dev server running, verify the mock preview without database writes:

```sh
node scripts/check-citation-probe.mjs http://localhost:3000
```

To verify a real Supabase save and read-back (creates one labeled mock audit):

```sh
node scripts/check-citation-probe.mjs http://localhost:3000 --save
```

Adjust the port to match your server. `lib/gemini.ts` is retained for later live
API reconnection but is not imported by the mock action. `GEMINI_API_KEY` stays
server-only and is not required for mock mode. No live Gemini probes are needed
for the revised Day 3 acceptance criteria.

## Day 4: Sitemap discovery and HTTP status checks

Server-side code can import `fetchSitemapUrls` and `checkUrlStatus` from
`@/lib/seo`. These utilities are independent of the existing mock audit UI.

- `await fetchSitemapUrls("example.com")` starts at HTTPS `/sitemap.xml`.
  If that cannot be used, it reads `Sitemap:` directives in `/robots.txt`.
  It follows sitemap indexes, handles namespaces, escaped entities and gzip,
  removes duplicate URLs, and skips malformed, non-HTTP(S), or credential-bearing
  page URLs. It extracts page entries, not image-extension URLs. A full HTTP(S)
  origin is also accepted; paths and query strings are rejected for this input.
- `await checkUrlStatus("https://example.com/page")` follows redirects and
  returns the final HTTP status. It tries HEAD first, then GET for HEAD
  responses of 403, 405, or 501. GET bodies are cancelled after headers arrive.
  A returned 404 is an actual HTTP response; timeouts and network failures throw.

Discovery has a 30-second overall timeout and stops with an error rather than
silently truncating results above 50 sitemap documents or 50,000 unique URLs.
Each XML document is limited to 50 MiB (including after gzip decompression);
robots.txt is limited to 512 KiB. Status checks have a 10-second overall timeout.
Requests bypass caching and allow at most five redirects. Empty valid sitemaps
return `[]`; missing or invalid discovery and failed child sitemaps reject.
The utility parses robots.txt for discovery only; it is not a crawler.

Run the focused tests with `npm run test:seo`. Tests use fixtures and a local
HTTP server, so no third-party service or credentials are required. No Gemini
calls, database writes, API routes, or UI changes were added for Day 4.

## Day 5: Audit pipeline API

`GET /api/audit` preserves the setup check. `POST /api/audit` accepts a JSON
object with `domain` (hostname only) and `buyerPrompt` (1-4000 characters).
Start `npm run dev` and test from PowerShell:

```powershell
$body = @{ domain = 'nextjs.org'; buyerPrompt = 'Find official Next.js installation documentation and cite its URLs.' } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/audit -Method Post -ContentType 'application/json' -Body $body
```

The POST pipeline uses live Gemini 3.8 Flash with Google Search grounding,
extracts text/metadata URLs (including Google citation redirect destinations),
discovers the sitemap, checks citations matching the target hostname or its
subdomains, and suggests the closest verified 2xx sitemap destination for 404s.
Ranking combines path-token and character-bigram similarity, checks up to five
candidates per 404, and leaves the suggestion null if none is verified live.
Third-party citations remain in extractedUrls but are not scanned.

A successful save returns HTTP 201 with `auditId`, `createdAt`, generated text,
grounding metadata, extracted URLs, findings, warnings, and completed/partial
status. Unknown network statuses stay null; they never become invented 404s.
Sitemap or individual-check failures produce explicit partial reports. The
existing database schema saves audit domain/status and confirmed 404s with their
suggested redirects; prompt, generated text, and metadata are returned in JSON
but are not stored in the current tables. Saves are verified by read-back;
failed partial saves attempt to remove only the newly created audit.

This admin-backed endpoint is development-only until authentication is added;
production POST returns 403. It requires the existing Gemini and server-only
Supabase configuration. No mock fallback is used. Gemini failures return a safe
upstream error (429 for Google's rate-limit response), and do not save an audit.
The previous Day 3 mock workspace remains unchanged and makes no Gemini calls.

Input is limited to 16 KiB, 100 extracted citations and 50 target-domain URLs.
Status checks run with concurrency five; no new checks start after a 30-second
checking budget, and each in-flight check retains its Day 4 timeout. Sitemap
and Gemini calls use their own existing timeouts. Run `npm run test:audit` and
`npm run test:seo` for deterministic backend coverage without live providers.
