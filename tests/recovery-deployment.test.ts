import assert from "node:assert/strict";
import { test } from "node:test";
import { deployShopifyUrlRedirect } from "../lib/shopify/redirects";
import { cloudflareRows, formatCloudflareRedirects, verifyDeployedRedirect } from "../lib/recovery/verify";

test("Shopify GraphQL duplicate path is updated after the create mutation reports a path conflict", async () => {
  const original = globalThis.fetch;
  const requests: { query: string; variables: Record<string, unknown> }[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://shop.myshopify.com/admin/api/2026-10/graphql.json");
    assert.equal((init?.headers as Record<string, string>)["X-Shopify-Access-Token"], "test-shopify-token");
    const request = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
    requests.push(request);
    if (request.query.includes("mutation UrlRedirectCreate")) return Response.json({ data: { urlRedirectCreate: { urlRedirect: null, userErrors: [{ field: ["urlRedirect", "path"], message: "Path already exists" }] } } });
    if (request.query.includes("query UrlRedirectByPath")) return Response.json({ data: { urlRedirects: { nodes: [{ id: "gid://shopify/UrlRedirect/123", path: "/old", target: "/other" }] } } });
    return Response.json({ data: { urlRedirectUpdate: { urlRedirect: { id: "gid://shopify/UrlRedirect/123", path: "/old", target: "/new" }, userErrors: [] } } });
  };
  try {
    const result = await deployShopifyUrlRedirect("shop.myshopify.com", "test-shopify-token", "/old", "/new");
    assert.equal(result.target, "/new");
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[2].variables, { id: "gid://shopify/UrlRedirect/123", urlRedirect: { path: "/old", target: "/new" } });
  } finally { globalThis.fetch = original; }
});

test("Shopify GraphQL surfaces non-duplicate path errors without another mutation", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ data: { urlRedirectCreate: { urlRedirect: null, userErrors: [{ field: null, message: "Access denied" }] } } }); };
  try {
    await assert.rejects(deployShopifyUrlRedirect("shop.myshopify.com", "test-shopify-token", "/old", "/new"), /Access denied/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("Cloudflare bulk redirect formatter emits the required CSV columns and JSON records", () => {
  const rows = cloudflareRows("example.com", [{ dead_url: "https://example.com/products/old?color=blue", suggested_target_url: "https://example.com/products/new" }]);
  const csv = formatCloudflareRedirects(rows, "csv");
  assert.equal(csv.split("\n")[0], "source_url,target_url,status_code");
  assert.match(csv, /"https:\/\/example\.com\/products\/old\?color=blue","https:\/\/example\.com\/products\/new","301"/);
  assert.deepEqual(JSON.parse(formatCloudflareRedirects(rows, "json")), [{ source_url: "https://example.com/products/old?color=blue", target_url: "https://example.com/products/new", status_code: 301 }]);
});

test("live verifier accepts one direct 301 and a 200 destination, rejecting chains", async () => {
  const calls: string[] = [];
  const fetcher = async (value: string | URL) => {
    const url = String(value); calls.push(url);
    return url.endsWith("/old") ? new Response(null, { status: 301, headers: { Location: "/new" } }) : new Response(null, { status: 200 });
  };
  const verified = await verifyDeployedRedirect("https://example.com/old", "https://example.com/new", "example.com", fetcher as never);
  assert.equal(verified.ok, true);
  assert.deepEqual(calls, ["https://example.com/old", "https://example.com/new"]);
  const chained = await verifyDeployedRedirect("https://example.com/old", "https://example.com/new", "example.com", async value => String(value).endsWith("/old") ? new Response(null, { status: 301, headers: { Location: "/hop" } }) : new Response(null, { status: 200 }) as never);
  assert.equal(chained.ok, false);
  assert.match(chained.reason, /directly/);
});

test("live verifier reports non-redirecting sources, unavailable destinations, and network failures without following redirects", async () => {
  const sourceMissing = await verifyDeployedRedirect("https://example.com/old", "https://example.com/new", "example.com", async () => new Response(null, { status: 404 }) as never);
  assert.equal(sourceMissing.ok, false);
  assert.equal(sourceMissing.oldUrlStatus, 404);
  assert.equal(sourceMissing.destinationStatus, null);

  let destinationCalls = 0;
  const destinationRedirect = await verifyDeployedRedirect("https://example.com/old", "https://example.com/new", "example.com", async input => {
    if (String(input).endsWith("/old")) return new Response(null, { status: 302, headers: { Location: "/new" } });
    destinationCalls++;
    return new Response(null, { status: 302, headers: { Location: "/final" } }) as never;
  });
  assert.equal(destinationRedirect.ok, false);
  assert.equal(destinationRedirect.destinationStatus, 302);
  assert.equal(destinationCalls, 1);

  const unavailable = await verifyDeployedRedirect("https://example.com/old", "https://example.com/new", "example.com", async () => { throw new Error("offline"); });
  assert.equal(unavailable.ok, false);
  assert.match(unavailable.reason, /could not reach/);
});
