import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Database } from "../lib/database.types";
import type { runAudit } from "../lib/audit-pipeline";
import { createWeeklyScanHandler, indiaWeekStart } from "../lib/weekly-scan";
import { WeeklyScanStore, type WeeklyDigest, type WeeklyJob } from "../lib/weekly-scan-store";
import { renderWeeklyDigest } from "../lib/email";

type Run = Database["public"]["Tables"]["weekly_scan_runs"]["Row"];
const now = new Date("2026-11-02T03:30:00Z");
const run: Run = { id: "run-1", week_start: "2026-11-02", status: "running", total_jobs: 2, lease_token: null, last_error: null, created_at: now.toISOString(), updated_at: now.toISOString(), finished_at: null, digests_prepared_at: now.toISOString() };
const makeJob = (id: string, user: string, attempts = 0): WeeklyJob => ({ id, run_id: run.id, user_id: user, domain: "example.com", buyer_prompt: "Find documentation", status: "pending", attempts, lease_token: null, started_at: null, finished_at: null, audit_id: null, last_error: null, created_at: now.toISOString(), updated_at: now.toISOString() });
const request = (secret: string, action = "start") => new Request("http://localhost/api/cron/weekly-scan", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ action }) });
function fakeStore(jobs: WeeklyJob[] = []) {
  const updates: { id: string; status: string }[] = [];
  const messages: string[] = [];
  let initialized = 0, finished = 0;
  const priorAudit: WeeklyScanStore["priorAudit"] = async () => "none";
  return {
    updates,
    messages,
    get initialized() { return initialized; },
    get finished() { return finished; },
    getOrCreateRun: async () => run,
    oldestOpenRun: async () => run,
    claimInitialization: async () => "init-lease",
    listTargets: async () => [],
    initialize: async () => { initialized++; },
    releaseInitialization: async () => {},
    candidates: async () => jobs,
    claimJob: async (job: WeeklyJob) => ({ ...job, status: "running", attempts: job.attempts + 1, lease_token: "lease" }),
    priorAudit,
    finishJob: async (job: WeeklyJob, status: "completed" | "skipped" | "pending" | "failed", message: string | null) => { updates.push({ id: job.id, status }); if (message) messages.push(message); },
    prepareDigests: async () => {},
    digestCandidates: (async () => []) as WeeklyScanStore["digestCandidates"],
    claimDigest: (async () => null) as WeeklyScanStore["claimDigest"],
    digestLinks: (async () => []) as WeeklyScanStore["digestLinks"],
    finishDigest: (async () => {}) as WeeklyScanStore["finishDigest"],
    finishRunIfDone: async () => { finished++; },
  };
}

test("cron bearer authentication rejects missing or invalid secrets before database access", async () => {
  let storeCalls = 0;
  const store = fakeStore();
  const handler = createWeeklyScanHandler({ secret: () => "long-test-secret", store: () => { storeCalls++; return store; } });
  assert.equal((await handler(request("wrong"))).status, 401);
  assert.equal(storeCalls, 0);
  assert.equal((await createWeeklyScanHandler({ secret: () => undefined })(request("wrong"))).status, 503);
  assert.equal((await handler(request("long-test-secret", "invalid"))).status, 400);
  assert.equal(storeCalls, 0);
});

test("week boundaries use Asia/Kolkata rather than the server timezone", () => {
  assert.equal(indiaWeekStart(new Date("2026-11-01T18:29:59Z")), "2026-10-26");
  assert.equal(indiaWeekStart(new Date("2026-11-01T18:30:00Z")), "2026-11-02");
});

test("only currently eligible Pro jobs run and each result is logged", async () => {
  const store = fakeStore([makeJob("job-pro", "pro-user"), makeJob("job-free", "free-user")]);
  const scanned: string[] = [];
  const handler = createWeeklyScanHandler({ secret: () => "secret", store: () => store, now: () => now, hasPro: async (userId) => userId === "pro-user", scan: async (job) => { scanned.push(job.id); } });
  const response = await handler(request("secret", "drain"));
  assert.equal(response.status, 200);
  assert.deepEqual(scanned, ["job-pro"]);
  assert.deepEqual(store.updates.sort((a,b) => a.id.localeCompare(b.id)), [{ id: "job-free", status: "skipped" }, { id: "job-pro", status: "completed" }]);
  assert.equal(store.finished, 1);
});

test("existing saved weekly audits are not repeated and failures retry up to three attempts", async () => {
  const store = fakeStore([makeJob("already-saved", "pro"), makeJob("last-attempt", "pro", 2)]);
  store.priorAudit = async (job: WeeklyJob) => job.id === "already-saved" ? "saved" : "none";
  let scans = 0;
  const handler = createWeeklyScanHandler({ secret: () => "secret", store: () => store, now: () => now, hasPro: async () => true, scan: async () => { scans++; throw new Error("provider down"); } });
  assert.equal((await handler(request("secret", "drain"))).status, 200);
  assert.equal(scans, 1);
  assert.deepEqual(store.updates.sort((a,b) => a.id.localeCompare(b.id)), [{ id: "already-saved", status: "completed" }, { id: "last-attempt", status: "failed" }]);
});

test("Groq rate limits are recorded without exposing provider details", async () => {
  const store = fakeStore([makeJob("rate-limited", "pro")]);
  const handler = createWeeklyScanHandler({ secret: () => "secret", store: () => store, now: () => now, hasPro: async () => true, scan: async () => { throw Object.assign(new Error("private provider details"), { status: 429 }); } });
  assert.equal((await handler(request("secret", "drain"))).status, 200);
  assert.deepEqual(store.updates, [{ id: "rate-limited", status: "pending" }]);
  assert.deepEqual(store.messages, ["Groq rate limit or quota exceeded."]);
});

test("deferred execution acknowledges the relay before running the queued work", async () => {
  const store = fakeStore();
  let work: (() => Promise<void>) | undefined;
  let storeCalls = 0;
  const handler = createWeeklyScanHandler({ secret: () => "secret", store: () => { storeCalls++; return store; }, defer: (task) => { work = task; }, now: () => now });
  const response = await handler(request("secret"));
  assert.equal(response.status, 202);
  assert.equal(storeCalls, 0);
  assert.ok(work);
  await work();
  assert.equal(storeCalls, 1);
  assert.equal(store.finished, 1);
});

const oldFetch = globalThis.fetch;
const oldEnv = process.env;
afterEach(() => { globalThis.fetch = oldFetch; process.env = oldEnv; });

test("target discovery paginates subscriptions, deduplicates owned domains, and excludes free users", async () => {
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key", WEEKLY_SCAN_PROMPT: "Find documentation" };
  let subscriptionPages = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (url.pathname.endsWith("/subscriptions")) {
      subscriptionPages++;
      if (offset === 0) return Response.json(Array.from({ length: 500 }, (_, i) => ({ id: String(i), user_id: i === 0 ? "pro-user" : "expired-" + i, status: i === 0 ? "active" : "expired", cancelled: false, ends_at: null })));
      return Response.json([{ id: "501", user_id: "cancelled-user", status: "cancelled", cancelled: true, ends_at: "2026-12-01T00:00:00Z" }]);
    }
    if (url.pathname.endsWith("/audits")) return Response.json([
      { id: "a", user_id: "pro-user", domain: "example.com", buyer_prompt: "Latest custom prompt" },
      { id: "b", user_id: "pro-user", domain: "example.com", buyer_prompt: "Older prompt" },
      { id: "c", user_id: "cancelled-user", domain: "example.org" },
      { id: "d", user_id: "expired-4", domain: "example.net" },
      { id: "e", user_id: null, domain: "example.io" },
      { id: "f", user_id: "pro-user", domain: "localhost" },
    ]);
    throw new Error("Unexpected database request");
  };
  const targets = await new WeeklyScanStore().listTargets(now);
  assert.equal(subscriptionPages, 2);
  assert.deepEqual(targets, [
    { user_id: "pro-user", domain: "example.com", buyer_prompt: "Latest custom prompt" },
    { user_id: "cancelled-user", domain: "example.org", buyer_prompt: "Find documentation" },
  ]);
});
test("scheduled persistence writes only confirmed 404s under the job ID and owner", async () => {
  const { persistAudit } = await import("../lib/audit-store");
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key" };
  const jobId = "00000000-0000-4000-8000-000000000017";
  let insertedLinks: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/audits") && method === "POST") {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.id, jobId);
      assert.equal(body.user_id, "pro-user");
      assert.equal(body.domain, "example.com");
      return Response.json({ id: jobId, created_at: "2026-11-02T03:30:00Z" });
    }
    if (url.pathname.endsWith("/broken_links") && method === "POST") {
      insertedLinks = JSON.parse(String(init?.body));
      return new Response(null, { status: 201 });
    }
    if (url.pathname.endsWith("/audits") && method === "PATCH") {
      assert.equal(JSON.parse(String(init?.body)).buyer_prompt, "Find docs");
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/audits") && method === "GET") return Response.json({ id: jobId, user_id: "pro-user", status: "completed", broken_links: [{ id: "link-1" }] });
    throw new Error("Unexpected database request");
  };
  const report: Parameters<typeof persistAudit>[0] = {
    domain: "example.com", buyerPrompt: "Find docs", generatedText: "", groundingMetadata: null,
    extractedUrls: [], sitemapUrlCount: 0, warnings: [], status: "completed",
    findings: [
      { url: "https://example.com/missing", httpStatus: 404, urlState: "404", suggestedRedirect: null, error: null },
      { url: "https://example.com/working", httpStatus: 200, urlState: "200", suggestedRedirect: null, error: null },
    ],
  };
  const saved = await persistAudit(report, "pro-user", undefined, jobId);
  assert.equal(saved.id, jobId);
  assert.deepEqual(insertedLinks, [{ audit_id: jobId, cited_url: "https://example.com/missing", http_status: 404, url_state: "404", approval_status: "pending_review", suggested_redirect: null, match_confidence: null, match_evidence_reason: "manual_mapping_required: no eligible live destination candidate was found." }]);
});
test("scheduled scans use the Groq/Tavily probe and save results to the job's owner and stable audit ID", async () => {
  const { runWeeklyAudit } = await import("../lib/weekly-scan");
  const { runCitationProbe } = await import("../lib/citation-probe");
  process.env = { ...oldEnv, AUDIT_PERSISTENCE_MODE: "database" };
  const job = makeJob("00000000-0000-4000-8000-000000000017", "pro-user");
  const execute: typeof runAudit = async (input, overrides, userId) => {
    assert.deepEqual(input, { domain: job.domain, buyerPrompt: job.buyer_prompt });
    assert.equal(overrides?.probe, runCitationProbe);
    assert.equal(userId, "pro-user");
    assert.ok(overrides?.save);
    const saved = await overrides.save({ domain: job.domain, buyerPrompt: job.buyer_prompt, generatedText: "", groundingMetadata: null, extractedUrls: [], sitemapUrlCount: 0, warnings: [], status: "completed", findings: [] }, userId);
    return { domain: job.domain, buyerPrompt: job.buyer_prompt, generatedText: "", groundingMetadata: null, extractedUrls: [], sitemapUrlCount: 0, warnings: [], status: "completed", findings: [], auditId: saved.id, createdAt: saved.createdAt, persistence: { status: "saved" }, suggestionCandidatesPer404: 5 };
  };
  await runWeeklyAudit(job, {
    execute,
    save: async (_report, owner, reservation, scheduledId) => {
      assert.equal(owner, "pro-user");
      assert.equal(reservation, undefined);
      assert.equal(scheduledId, job.id);
      return { id: job.id, createdAt: now.toISOString() };
    },
  });
  process.env.AUDIT_PERSISTENCE_MODE = "local";
  await assert.rejects(runWeeklyAudit(job, { execute }), /require database persistence/);
});

test("a previously saved job is recognized without inserting or deleting another audit", async () => {
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key" };
  const job = makeJob("00000000-0000-4000-8000-000000000017", "pro-user");
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.equal(init?.method ?? "GET", "GET");
    return Response.json([{ id: job.id, user_id: job.user_id, domain: job.domain, status: "completed", created_at: now.toISOString() }]);
  };
  assert.equal(await new WeeklyScanStore().priorAudit(job, now), "saved");
  assert.equal(calls, 1);
});
test("a per-domain lease is claimed by only one competing worker", async () => {
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key" };
  const original = makeJob("00000000-0000-4000-8000-000000000017", "pro-user");
  let row: WeeklyJob = { ...original };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.method, "PATCH");
    const expectedStatus = url.searchParams.get("status");
    const expectedAttempts = url.searchParams.get("attempts");
    if (expectedStatus !== `eq.${row.status}` || expectedAttempts !== `eq.${row.attempts}`) return Response.json(null);
    row = { ...row, ...JSON.parse(String(init?.body)) };
    return Response.json(row);
  };
  const store = new WeeklyScanStore();
  const claims = await Promise.all([store.claimJob(original, now), store.claimJob(original, now)]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(row.status, "running");
  assert.equal(row.attempts, 1);
  assert.ok(row.lease_token);
});
test("Edge relay rejects invalid bearer tokens and forwards only authorized scan actions", async () => {
  let edgeHandler: ((request: Request) => Promise<Response>) | undefined;
  const edgeEnv: Record<string, string> = { CRON_SECRET: "edge-test-secret", WEEKLY_SCAN_APP_URL: "https://app.example.com" };
  const globalObject = globalThis as typeof globalThis & { Deno?: unknown };
  const previousDeno = globalObject.Deno;
  globalObject.Deno = { env: { get: (name: string) => edgeEnv[name] }, serve: (handler: (request: Request) => Promise<Response>) => { edgeHandler = handler; } };
  try {
    await import("../supabase/functions/weekly-scan/index");
    assert.ok(edgeHandler);
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls++;
      assert.equal(String(input), "https://app.example.com/api/cron/weekly-scan");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer edge-test-secret");
      assert.deepEqual(JSON.parse(String(init?.body)), { action: "drain" });
      return Response.json({ status: "accepted" }, { status: 202 });
    };
    const edgeRequest = (token: string, action: string) => new Request("https://edge.example.com", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ action }) });
    assert.equal((await edgeHandler(edgeRequest("wrong", "drain"))).status, 401);
    assert.equal(calls, 0);
    assert.equal((await edgeHandler(edgeRequest("edge-test-secret", "drain"))).status, 200);
    assert.equal(calls, 1);
    assert.equal((await edgeHandler(edgeRequest("edge-test-secret", "invalid"))).status, 400);
    assert.equal(calls, 1);
  } finally {
    if (previousDeno === undefined) delete globalObject.Deno;
    else globalObject.Deno = previousDeno;
  }
});
test("a weekly run queues a Pro domain, claims it, and records completion through Supabase", async () => {
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key", WEEKLY_SCAN_PROMPT: "Find documentation" };
  const runId = "00000000-0000-4000-8000-000000000100";
  const jobId = "00000000-0000-4000-8000-000000000101";
  let runRow: Run | null = null;
  let jobRow: WeeklyJob | null = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname;
    if (path.endsWith("/weekly_scan_runs") && method === "POST") {
      runRow = { id: runId, week_start: "2026-11-02", status: "initializing", total_jobs: 0, lease_token: null, last_error: null, created_at: now.toISOString(), updated_at: now.toISOString(), finished_at: null, digests_prepared_at: null };
      return Response.json(runRow);
    }
    if (path.endsWith("/weekly_scan_runs") && method === "PATCH") {
      assert.ok(runRow);
      runRow = { ...runRow, ...JSON.parse(String(init?.body)) } as Run;
      return url.searchParams.has("select") ? Response.json({ id: runId }) : new Response(null, { status: 204 });
    }
    if (path.endsWith("/weekly_scan_runs") && method === "GET") {
      assert.ok(runRow);
      return Response.json({ created_at: runRow.created_at, digests_prepared_at: runRow.digests_prepared_at });
    }
    if (path.endsWith("/subscriptions") && method === "GET") return Response.json([{ id: "s1", user_id: "pro-user", status: "active", cancelled: false, ends_at: null }]);
    if (path.endsWith("/audits") && method === "GET") {
      if (url.searchParams.has("id")) return Response.json([]);
      return Response.json([{ id: "previous", user_id: "pro-user", domain: "example.com" }]);
    }
    if (path.endsWith("/weekly_scan_jobs") && method === "POST") {
      const inserted = JSON.parse(String(init?.body))[0];
      jobRow = { ...makeJob(jobId, inserted.user_id), run_id: runId, domain: inserted.domain, buyer_prompt: inserted.buyer_prompt };
      return new Response(null, { status: 201 });
    }
    if (path.endsWith("/weekly_scan_jobs") && method === "HEAD") {
      const filter = url.searchParams.get("status");
      const count = filter === null ? (jobRow ? 1 : 0) : filter.includes("pending") || filter.includes("running") ? (jobRow && ["pending", "running"].includes(jobRow.status) ? 1 : 0) : jobRow?.status === "failed" ? 1 : 0;
      return new Response(null, { status: 200, headers: { "content-range": `*/${count}` } });
    }
    if (path.endsWith("/weekly_scan_jobs") && method === "GET") {
      return Response.json(url.searchParams.get("status") === "eq.pending" && jobRow?.status === "pending" ? [jobRow] : []);
    }
    if (path.endsWith("/weekly_scan_jobs") && method === "PATCH") {
      assert.ok(jobRow);
      jobRow = { ...jobRow, ...JSON.parse(String(init?.body)) } as WeeklyJob;
      return Response.json(url.searchParams.get("select") === "id" ? { id: jobId } : jobRow);
    }
    if (path.endsWith("/weekly_scan_digests") && method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    }
    if (path.endsWith("/weekly_scan_digests") && method === "GET") return Response.json([]);
    throw new Error(`Unexpected request: ${method} ${path}`);
  };
  const scanned: string[] = [];
  const handler = createWeeklyScanHandler({ secret: () => "secret", now: () => now, hasPro: async () => true, scan: async (job) => { scanned.push(job.user_id + ":" + job.domain); } });
  const response = await handler(request("secret"));
  assert.equal(response.status, 200);
  assert.deepEqual(scanned, ["pro-user:example.com"]);
  assert.equal((jobRow as WeeklyJob | null)?.status, "completed");
  assert.equal((jobRow as WeeklyJob | null)?.audit_id, jobId);
  assert.equal((runRow as Run | null)?.status, "completed");
  assert.equal((runRow as Run | null)?.total_jobs, 1);
});
test("existing audit saving remains compatible until the prompt column migration is applied", async () => {
  const { persistAudit } = await import("../lib/audit-store");
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key" };
  const updates: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/audits") && method === "POST") return Response.json({ id: "audit-1", created_at: now.toISOString() });
    if (url.pathname.endsWith("/audits") && method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      updates.push(body);
      if ("buyer_prompt" in body) return Response.json({ code: "PGRST204", message: "Could not find the buyer_prompt column" }, { status: 400 });
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/audits") && method === "GET") return Response.json({ id: "audit-1", user_id: "pro-user", status: "completed", broken_links: [] });
    throw new Error("Unexpected database request");
  };
  const report: Parameters<typeof persistAudit>[0] = { domain: "example.com", buyerPrompt: "Custom prompt", generatedText: "", groundingMetadata: null, extractedUrls: [], sitemapUrlCount: 0, warnings: [], status: "completed", findings: [] };
  assert.equal((await persistAudit(report, "pro-user")).id, "audit-1");
  assert.deepEqual(updates, [{ status: "completed", buyer_prompt: "Custom prompt" }, { status: "completed" }]);
});
test("free audit reservations also survive a missing buyer_prompt column", async () => {
  const { persistAudit } = await import("../lib/audit-store");
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key" };
  const createdAt = "2026-11-02T03:30:00.000Z";
  const updates: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      updates.push(body);
      assert.equal(url.searchParams.get("created_at"), "eq." + createdAt);
      if (body.status === "free_saving") return Response.json({ id: "reserved-id", created_at: createdAt });
      assert.equal(url.searchParams.get("status"), "eq.free_saving");
      if ("buyer_prompt" in body) return Response.json({ code: "PGRST204", message: "Could not find buyer_prompt" }, { status: 400 });
      return new Response(null, { status: 204 });
    }
    if (method === "GET") return Response.json({ id: "reserved-id", user_id: "free-user", status: "completed", broken_links: [] });
    throw new Error("Unexpected database request");
  };
  const report: Parameters<typeof persistAudit>[0] = { domain: "example.com", buyerPrompt: "Custom prompt", generatedText: "", groundingMetadata: null, extractedUrls: [], sitemapUrlCount: 0, warnings: [], status: "completed", findings: [] };
  await persistAudit(report, "free-user", { id: "reserved-id", createdAt });
  assert.deepEqual(updates, [{ status: "free_saving" }, { status: "completed", buyer_prompt: "Custom prompt" }, { status: "completed" }]);
});
test("a completed weekly run is not started again", async () => {
  const store = fakeStore([makeJob("never-run", "pro")]);
  store.getOrCreateRun = async () => ({ ...run, status: "completed" });
  let scans = 0;
  const handler = createWeeklyScanHandler({ secret: () => "secret", store: () => store, now: () => now, scan: async () => { scans++; } });
  const response = await handler(request("secret"));
  assert.equal((await response.json()).status, "completed");
  assert.equal(scans, 0);
});

test("failed queue initialization releases its lease for a later retry", async () => {
  const store = fakeStore();
  store.getOrCreateRun = async () => ({ ...run, status: "initializing" });
  store.listTargets = async () => { throw new Error("database unavailable"); };
  let released = 0;
  store.releaseInitialization = async () => { released++; };
  const handler = createWeeklyScanHandler({ secret: () => "secret", store: () => store, now: () => now });
  assert.equal((await handler(request("secret"))).status, 503);
  assert.equal(released, 1);
  assert.equal(store.finished, 0);
});

test("weekly digest renders escaped 404 details and only verified same-domain 301 rules", () => {
  const message = renderWeeklyDigest([
    { domain: "example.com", cited_url: "https://example.com/old?x=<script>", suggested_redirect: "https://example.com/new", audit_id: "audit-1" },
    { domain: "example.com", cited_url: "https://example.com/missing", suggested_redirect: "https://attacker.test/steal", audit_id: "audit-1" },
  ], "https://citemend.vercel.app");
  assert.match(message.html, /&lt;script&gt;/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.text, /Redirect 301 "\/old" "https:\/\/example.com\/new"/);
  assert.match(message.text, /No verified replacement/);
  assert.doesNotMatch(message.text, /attacker\.test/);
  assert.match(message.html, /https:\/\/citemend\.vercel\.app\/audit\/audit-1/);
});

test("a completed weekly scan sends one account digest and records its provider ID", async () => {
  const store = fakeStore();
  const digest: WeeklyDigest = { id: "digest-1", run_id: run.id, user_id: "pro-user", status: "pending", lease_token: null, started_at: null, finished_at: null, last_error: null, provider_message_id: null, created_at: now.toISOString(), updated_at: now.toISOString() };
  let prepared = 0, sent = 0;
  const states: string[] = [];
  store.prepareDigests = async () => { prepared++; };
  store.digestCandidates = async () => sent ? [] : [digest];
  store.claimDigest = async (candidate) => ({ ...candidate, status: "sending", lease_token: "lease" });
  store.digestLinks = async () => [{ domain: "example.com", cited_url: "https://example.com/old", suggested_redirect: "https://example.com/new", audit_id: "audit-1" }];
  store.finishDigest = async (_digest, status, messageId) => { states.push(`${status}:${messageId}`); if (status === "sent") sent++; };
  const handler = createWeeklyScanHandler({ secret: () => "secret", store: () => store, now: () => now, hasPro: async () => true, sendDigest: async (userId, digestId, links) => {
    assert.equal(userId, "pro-user"); assert.equal(digestId, digest.id); assert.equal(links.length, 1); return "resend-id";
  } });
  assert.equal((await handler(request("secret", "drain"))).status, 200);
  assert.equal((await handler(request("secret", "drain"))).status, 200);
  assert.equal(prepared, 2);
  assert.deepEqual(states, ["sent:resend-id"]);
});

test("weekly digest skips unchanged links and retries provider failures", async () => {
  const store = fakeStore();
  const digest: WeeklyDigest = { id: "digest-2", run_id: run.id, user_id: "pro-user", status: "pending", lease_token: null, started_at: null, finished_at: null, last_error: null, provider_message_id: null, created_at: now.toISOString(), updated_at: now.toISOString() };
  const states: string[] = [];
  store.digestCandidates = async () => [digest];
  store.claimDigest = async (candidate) => ({ ...candidate, status: "sending", lease_token: "lease" });
  store.digestLinks = async () => [];
  store.finishDigest = async (_digest, status) => { states.push(status); };
  let sends = 0;
  const handler = createWeeklyScanHandler({ secret: () => "secret", store: () => store, hasPro: async () => true, sendDigest: async () => { sends++; throw new Error("down"); } });
  assert.equal((await handler(request("secret", "drain"))).status, 200);
  assert.deepEqual(states, ["skipped"]);
  store.digestLinks = async () => [{ domain: "example.com", cited_url: "https://example.com/new", suggested_redirect: null, audit_id: "audit-1" }];
  assert.equal((await handler(request("secret", "drain"))).status, 200);
  assert.deepEqual(states, ["skipped", "pending"]);
  assert.equal(sends, 1);
});

test("digest comparison includes only newly confirmed 404s since the preceding audit", async () => {
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key" };
  const digest: WeeklyDigest = { id: "digest-3", run_id: run.id, user_id: "pro-user", status: "sending", lease_token: "lease", started_at: now.toISOString(), finished_at: null, last_error: null, provider_message_id: null, created_at: now.toISOString(), updated_at: now.toISOString() };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/weekly_scan_runs")) return Response.json({ created_at: now.toISOString() });
    if (url.pathname.endsWith("/weekly_scan_jobs")) return Response.json([{ audit_id: "audit-new", domain: "example.com" }]);
    if (url.pathname.endsWith("/audits")) {
      assert.equal(url.searchParams.get("created_at"), `lt.${now.toISOString()}`);
      return Response.json({ id: "audit-old", broken_links: [{ cited_url: "https://example.com/known" }] });
    }
    if (url.pathname.endsWith("/broken_links")) return Response.json([
      { cited_url: "https://example.com/known", http_status: 404, suggested_redirect: null },
      { cited_url: "https://example.com/new", http_status: 404, suggested_redirect: "https://example.com/fix" },
    ]);
    throw new Error("Unexpected database request");
  };
  assert.deepEqual(await new WeeklyScanStore().digestLinks(digest), [{ domain: "example.com", audit_id: "audit-new", cited_url: "https://example.com/new", suggested_redirect: "https://example.com/fix" }]);
});
