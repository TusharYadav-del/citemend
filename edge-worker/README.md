# CiteMend edge redirect Worker

This is a Cloudflare Worker Route proxy. It forwards a request to the existing
origin, then checks an approved redirect rule if the origin returned 404 **or** the
`Referer` host is ChatGPT, Perplexity, Claude, or Gemini. Only `GET` and `HEAD`
can redirect. An active rule returns HTTP 301; without a valid rule, the
original response passes through. A `Referer` is client-supplied and is only
a routing hint, not proof of where a visitor came from.

When `SUPABASE_URL` and `SUPABASE_ANON_KEY` are configured, Supabase's
`redirect_rules` REST endpoint is authoritative. The Worker requests only the
active destination for the exact hostname and path. Cloudflare caches that
lookup for five seconds, so edits can take up to five seconds to reach a
particular edge location. Database errors leave the origin response intact;
the Worker does not fall back to stale KV data. The key named
`SUPABASE_ANON_KEY` can contain the current Supabase publishable key. It is
sent in the `apikey` header and has only anonymous read access to active
routing columns. Never put a Supabase service key in the Worker.

Without Supabase credentials, local development retains the Day 22 KV lookup.
KV keys have the form `redirect:v1:<lowercase-host>:<pathname>`. Query strings
do not select a rule. Values are JSON:

```json
{"active":true,"destination":"https://example.com/new-path"}
```

The destination must use HTTPS on the exact source hostname, with no
credentials, custom port, fragment, or same-path loop. KV failures leave the
origin response intact. A 301 response uses `Cache-Control: no-store` so
temporary rule changes are less likely to stick in shared caches. This is an
explicit redirect rule, separate from the Week 3 audit's unapproved suggested
redirects. No Supabase service key is stored in the Worker.

## Local verification

Install dependencies within `edge-worker/`, copy `.dev.vars.example` to the
ignored `.dev.vars`, and use two terminals:

```powershell
node test/origin-server.mjs
wrangler dev --ip 127.0.0.1 --port 8787
```

Seed the local KV namespace from another terminal:

```powershell
wrangler kv key put 'redirect:v1:localhost:/old' --path test/redirect-rule.json --binding REDIRECTS --local
```

Then `http://localhost:8787/old` returns 301 to
`https://localhost/new`, while `http://localhost:8787/healthy` returns the
origin's 200. The test origin is only a fixture. Run `npm test -- --run` and
`npx tsc --noEmit` for the Worker checks.

## Account setup before deployment

Apply `supabase/migrations/007_redirect_rules.sql` before publishing rules.
The dashboard allows a Pro user to publish or disable verified suggestions from
their own saved audit. A published rule is stored in Supabase. The Worker
still needs a Cloudflare route on that hostname before it can handle traffic.

The `REDIRECTS` binding points to the hosted `citemend-redirects` KV namespace.
Local `wrangler dev` still uses isolated local KV data by default. A production
Worker Route also needs a hostname in a
Cloudflare zone with proxied DNS and an existing origin. Keep `ORIGIN_URL` in
the ignored `.dev.vars` for local tests; in a zone route, `fetch(request)`
forwards to that hostname's origin. No zone route or Worker is deployed by
the Day 22 initialization. The Day 23 Worker code is uploaded, but Cloudflare
reports no targets deployed. Verify domain control and the account allowed to
publish its rules before attaching a customer hostname to a route.

Cloudflare's [Worker Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
and [local KV binding](https://developers.cloudflare.com/kv/concepts/kv-bindings/)
guides describe those account steps.
