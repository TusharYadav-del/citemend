# CiteMend edge redirect Worker

This is a Cloudflare Worker Route proxy. It forwards a request to the existing
origin, then checks a `REDIRECTS` KV rule if the origin returned 404 **or** the
`Referer` host is ChatGPT, Perplexity, Claude, or Gemini. Only `GET` and `HEAD`
can redirect. An active rule returns HTTP 301; without a valid rule, the
original response passes through. A `Referer` is client-supplied and is only
a routing hint, not proof of where a visitor came from.

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

The `REDIRECTS` binding points to the hosted `citemend-redirects` KV namespace.
Local `wrangler dev` still uses isolated local KV data by default. A production
Worker Route also needs a hostname in a
Cloudflare zone with proxied DNS and an existing origin. Keep `ORIGIN_URL` in
the ignored `.dev.vars` for local tests; in a zone route, `fetch(request)`
forwards to that hostname's origin. No zone route or Worker is deployed by
this project initialization.

Cloudflare's [Worker Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
and [local KV binding](https://developers.cloudflare.com/kv/concepts/kv-bindings/)
guides describe those account steps.
