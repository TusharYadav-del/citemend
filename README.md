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
