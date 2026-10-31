import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuditPostHandler } from "../lib/audit-handler";
import { createRedirectExportHandler } from "../lib/redirect-export-handler";
import type { runAudit } from "../lib/audit-pipeline";

const auditBody = { domain: "example.com", buyerPrompt: "Find documentation" };
const exportBody = { domain: "example.com", format: "htaccess", links: [{ cited_url: "https://example.com/old", http_status: 404, suggested_redirect: "https://example.com/new" }] };
const request = (url: string, body: unknown) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const authenticated = { isConfigured: () => true, getUserId: async () => "user_123" };
const fakeReport = { persistence: { status: "saved" } } as Awaited<ReturnType<typeof runAudit>>;

test("free audit limit blocks the provider and Pro bypasses the reservation", async () => {
  let providerCalls = 0;
  const execute = (async () => { providerCalls++; return fakeReport; }) as typeof runAudit;
  const free = createAuditPostHandler({ ...authenticated, execute, hasPro: async () => false, reserveFree: async () => ({ kind: "limit" }) });
  const denied = await free(request("http://localhost/api/audit", auditBody));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "PRO_REQUIRED");
  assert.equal(providerCalls, 0);
  const pro = createAuditPostHandler({ ...authenticated, execute, hasPro: async () => true, reserveFree: async () => { throw new Error("Pro should bypass quota"); } });
  assert.equal((await pro(request("http://localhost/api/audit", auditBody))).status, 201);
  assert.equal(providerCalls, 1);
});

test("a free audit reserves a slot, releases it on success or failure, and concurrent attempts get busy", async () => {
  let released = 0;
  const free = createAuditPostHandler({
    ...authenticated, hasPro: async () => false,
    reserveFree: async (userId, domain) => { assert.equal(userId, "user_123"); assert.equal(domain, "example.com"); return { kind: "reserved", id: "reserved-id", createdAt: "2026-11-01T00:00:00Z" }; },
    releaseFree: async (userId, id, createdAt) => { assert.equal(userId, "user_123"); assert.equal(id, "reserved-id"); assert.equal(createdAt, "2026-11-01T00:00:00Z"); released++; },
    execute: (async (_input, overrides) => { assert.equal(typeof overrides?.save, "function"); return fakeReport; }) as typeof runAudit,
  });
  assert.equal((await free(request("http://localhost/api/audit", auditBody))).status, 201);
  assert.equal(released, 1);
  const failing = createAuditPostHandler({
    ...authenticated, hasPro: async () => false,
    reserveFree: async () => ({ kind: "reserved", id: "reserved-id", createdAt: "2026-11-01T00:00:00Z" }),
    releaseFree: async () => { released++; },
    execute: (async () => { throw new Error("provider unavailable"); }) as typeof runAudit,
  });
  assert.equal((await failing(request("http://localhost/api/audit", auditBody))).status, 502);
  assert.equal(released, 2);
  const busy = createAuditPostHandler({ ...authenticated, hasPro: async () => false, reserveFree: async () => ({ kind: "busy" }) });
  const busyResponse = await busy(request("http://localhost/api/audit", auditBody));
  assert.equal(busyResponse.status, 429);
  assert.equal((await busyResponse.json()).code, "AUDIT_IN_PROGRESS");
  const unavailable = createAuditPostHandler({ ...authenticated, hasPro: async () => { throw new Error("offline"); } });
  assert.equal((await unavailable(request("http://localhost/api/audit", auditBody))).status, 503);
});

test("redirect export requires an authenticated Pro subscription even for direct API requests", async () => {
  const anonymous = createRedirectExportHandler({ isConfigured: () => true, getUserId: async () => null });
  assert.equal((await anonymous(request("http://localhost/api/redirect-export", exportBody))).status, 401);
  const free = createRedirectExportHandler({ ...authenticated, hasPro: async () => false });
  assert.equal((await free(request("http://localhost/api/redirect-export", exportBody))).status, 403);
  const unavailable = createRedirectExportHandler({ ...authenticated, hasPro: async () => { throw new Error("offline"); } });
  assert.equal((await unavailable(request("http://localhost/api/redirect-export", exportBody))).status, 503);
  const pro = createRedirectExportHandler({ ...authenticated, hasPro: async () => true });
  const response = await pro(request("http://localhost/api/redirect-export", exportBody));
  assert.equal(response.status, 200);
  assert.match((await response.json()).content, /Redirect 301/);
});
