import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRedirectExport } from "../lib/redirect-export";

const links = [
  { cited_url: "https://example.com/old-page?source=ai", http_status: 404, suggested_redirect: "https://example.com/new-page" },
  { cited_url: "https://example.com/unfixed", http_status: 404, suggested_redirect: null },
  { cited_url: "https://example.com/working", http_status: 200, suggested_redirect: "https://example.com/should-not-include" },
  { cited_url: "https://example.com/external", http_status: 404, suggested_redirect: "https://attacker.example/landing" },
];

test("exports only confirmed 404s with verified same-domain destinations in htaccess format", () => {
  assert.equal(buildRedirectExport("example.com", links, "htaccess"), [
    "# 301 redirects for example.com",
    'Redirect 301 "/old-page" "https://example.com/new-page"',
  ].join("\n"));
});

test("creates deployable Vercel redirects with permanent 301 semantics", () => {
  assert.deepEqual(JSON.parse(buildRedirectExport("example.com", links, "vercel")), {
    redirects: [{ source: "/old-page?source=ai", destination: "https://example.com/new-page", permanent: true }],
  });
});

test("creates Shopify import CSV with path redirects and escaped cells", () => {
  assert.equal(buildRedirectExport("example.com", links, "shopify"), [
    '"Redirect from","Redirect to"',
    '"/old-page?source=ai","/new-page"',
  ].join("\n"));
});

test("returns an empty format-specific export when no safe redirects exist", () => {
  const unsafe = [{ ...links[0], suggested_redirect: "https://attacker.example/landing" }];
  assert.equal(buildRedirectExport("example.com", unsafe, "vercel"), '{\n  "redirects": []\n}');
  assert.equal(buildRedirectExport("example.com", unsafe, "shopify"), '"Redirect from","Redirect to"');
  assert.equal(buildRedirectExport("example.com", unsafe, "htaccess"), "# 301 redirects for example.com");
});
