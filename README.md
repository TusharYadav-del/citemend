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

## Day 3: Gemini citation probe

1. Create a key at https://aistudio.google.com/apikey and save it in `.env.local`:
   `GEMINI_API_KEY=your_key`. Never use a `NEXT_PUBLIC_` prefix for this key.
2. Run `npm run dev`, then open `/dev/citation-probe` at the URL printed in the
   terminal. Enter a hostname and a research prompt, then click **Run citation probe**.
3. A successful server action displays generated text, raw `groundingMetadata`,
   extracted sources, and citation segments linked by zero-based source indices.
   Missing grounding metadata means no sources were returned; it is not proof of
   a successful grounded search. Source URLs are preserved as returned, including
   Google grounding redirect URLs; no HTTP link scanning is performed.

`lib/gemini.ts` reads the key only on the server when a probe runs. The test page
and its action are disabled in production. No Gemini call occurs during a build
or when loading the existing homepage. The probe does not save database rows.
Provider access and free-tier quota depend on your AI Studio project. An HTTP
error on the form shows the status without exposing provider request details.

With the development server running, verify an actual server-action response:

```sh
node scripts/check-citation-probe.mjs http://localhost:3000
```

Adjust the port to match your server. This submits one Gemini request and exits
successfully only when text, grounding metadata, sources, and citation segments
are returned. It does not print your key or the generated response.

The Day 3 model was changed to `gemini-3.8-flash` with user approval because
Google rejects `gemini-2.5-flash` for new users. The configured project currently
returns HTTP 429 RESOURCE_EXHAUSTED. Check its quota at https://ai.dev/rate-limit;
a successful live grounded response is still required to complete Day 3.

Troubleshooting: a 429 does not establish that all project quota is exhausted.
Check the project owning the saved key, the selected model's RPM/TPM/RPD limits,
and Google Search grounding limits. A 503 indicates temporary model overload.
The probe retries 503 once and does not automatically retry 429 responses.
