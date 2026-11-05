import assert from "node:assert/strict";
import { test } from "node:test";
import { createVerifyFixHandler } from "../lib/verify-fix-handler";
import type { createServerDatabase } from "../lib/supabase-server";

const auditId = "6c4c2f50-56a9-4d66-a462-4dbfa68ee4b1";
const brokenLinkId = "d98a5c0a-01a9-4d17-a9b1-2df80515548c";
const key = "Abcdefgh_1234567";

function databaseSpy() {
  const updates: { table: string; value: unknown }[] = [];
  const db = { from(table: string) {
    const query = {
      select() { return query; }, eq() { return query; },
      maybeSingle: async () => table === "broken_links" ? ({ data: { id: brokenLinkId, audit_id: auditId, cited_url: "https://acme.com/old", suggested_redirect: "https://acme.com/new", approval_status: "deployed", deployed_at: "2026-11-01T00:00:00Z", audits: { user_id: "user-1", domain: "acme.com", buyer_prompt: "best acme product", indexnow_key: key } }, error: null }) : ({ data: null, error: null }),
      upsert(value: unknown) { updates.push({ table, value }); return query; },
      single: async () => ({ data: { id: "outcome-1" }, error: null }),
      update(value: unknown) { updates.push({ table, value }); return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ error: null }).then(resolve); },
    };
    return query;
  } };
  return { db: db as unknown as ReturnType<typeof createServerDatabase>, updates };
}

const body = { auditId, brokenLinkId };

test("verifies owner fix, checks citations, and submits IndexNow after key-file confirmation", async () => {
  const { db, updates } = databaseSpy();
  const requests: string[] = [];
  const handler = createVerifyFixHandler({
    getUserId: async () => "user-1", database: () => db,
    trace: async () => ({ status: 200, finalUrl: "https://acme.com/new", visitedUrls: ["https://acme.com/old", "https://acme.com/new"] }),
    record: async () => ({ id: "observation-1", audit_id: auditId, domain: "acme.com", prompt_query: "best acme product", provider: "groq-test", model_name: "configured-citation-probe", job_status: "completed", retry_count: 0, observed_at: new Date().toISOString() }),
    check: async url => url.endsWith("/old") ? 200 : 200,
    probe: async () => ({ text: "Acme: https://acme.com/new", citedUrls: ["https://acme.com/new"], providerUsed: "groq-test", searchGrounding: { status: "available", sources: [] }, warnings: [] }),
    fetch: async (url, init) => { requests.push(`${init?.method ?? "GET"} ${String(url)}`); return new Response(String(url).endsWith(`${key}.txt`) ? key : null, { status: 200 }); },
  });
  const response = await handler(new Request("http://localhost/api/verify-fix", { method: "POST", body: JSON.stringify(body) }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.verified, true);
  assert.equal(result.badge, "✅ Technical deployment verified");
  assert.equal(result.technical_deployment_verified, true);
  assert.equal(result.ai_citation_observed, true);
  assert.equal(result.indexNow.status, "submitted");
  assert.ok(requests.includes("POST https://api.indexnow.org/indexnow"));
  assert.ok(updates.some(row => row.table === "citation_hijack_opportunities"));
});

test("reports a missing IndexNow key file without blocking successful fix verification", async () => {
  const { db } = databaseSpy();
  let indexNowCalls = 0;
  const handler = createVerifyFixHandler({
    getUserId: async () => "user-1", database: () => db,
    trace: async () => ({ status: 200, finalUrl: "https://acme.com/new", visitedUrls: ["https://acme.com/old", "https://acme.com/new"] }),
    check: async () => 200,
    probe: async () => { throw new Error("provider down"); },
    fetch: async () => { indexNowCalls++; return new Response("missing", { status: 404 }); },
  });
  const response = await handler(new Request("http://localhost/api/verify-fix", { method: "POST", body: JSON.stringify(body) }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.verified, true);
  assert.equal(result.indexNow.status, "key_file_missing");
  assert.equal(indexNowCalls, 1);
  assert.match(result.warning, /AI citation re-check was unavailable/);
});

test("rejects unauthenticated, malformed, and invalid key requests before database access", async () => {
  let dbCalls = 0;
  const make = (userId: string | null) => createVerifyFixHandler({ getUserId: async () => userId, database: () => { dbCalls++; throw new Error("must not connect"); } });
  assert.equal((await make(null)(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }))).status, 401);
  assert.equal((await make("user-1")(new Request("http://localhost", { method: "POST", body: "{}" }))).status, 400);
  assert.equal((await make("user-1")(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...body, indexNowKey: "no" }) }))).status, 400);
  assert.equal(dbCalls, 0);
});
