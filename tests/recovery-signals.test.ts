import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRecoverySignal } from "../lib/recovery/signals";
import { classifyRedirectQa, createRecoveryQaCronHandler } from "../lib/recovery/qa-cron";
import type { createServerDatabase } from "../lib/supabase-server";

test("signal ingestion normalizes paths and stores only an external referrer host", () => {
  const signal = parseRecoverySignal({
    domain: "Example.com",
    pageUrl: "https://example.com/Products/Blue-Shoe/?utm_source=chatgpt&variant=large",
    referrer: "https://chatgpt.com/c/123?private=should-not-be-stored",
    userAgent: "GPTBot spoofed by page visitor",
  }, "https://example.com");
  assert.deepEqual(signal, { domain: "example.com", normalizedPath: "/products/blue-shoe", referrerHost: "chatgpt.com", origin: "https://example.com" });
  assert.equal("userAgent" in (signal ?? {}), false);
  assert.equal(parseRecoverySignal({ domain: "example.com", pageUrl: "https://example.com/old", referrer: "https://example.com/page" }, "https://example.com")?.referrerHost, null);
});

test("signal ingestion rejects mismatched origins, insecure pages, and malformed URLs", () => {
  const input = { domain: "example.com", pageUrl: "https://example.com/products/old" };
  assert.equal(parseRecoverySignal(input, "https://attacker.example"), null);
  assert.equal(parseRecoverySignal({ ...input, pageUrl: "http://example.com/products/old" }, "http://example.com"), null);
  assert.equal(parseRecoverySignal({ ...input, pageUrl: "https://example.com.evil.test/old" }, "https://example.com"), null);
  assert.equal(parseRecoverySignal({ ...input, pageUrl: "https://example.com/old#fragment" }, "https://example.com"), null);
  assert.equal(parseRecoverySignal(input, null), null);
});

test("redirect QA distinguishes healthy redirects, dead targets, chains, and unavailable checks", () => {
  assert.equal(classifyRedirectQa({ ok: true, oldUrlStatus: 301, location: "https://example.com/new", destinationStatus: 200, reason: "ok" }), "healthy");
  assert.equal(classifyRedirectQa({ ok: false, oldUrlStatus: 301, location: "https://example.com/new", destinationStatus: 404, reason: "destination does not return HTTP 200" }), "destination_not_200");
  assert.equal(classifyRedirectQa({ ok: false, oldUrlStatus: 301, location: "https://example.com/hop", destinationStatus: null, reason: "does not point directly to approved target" }), "redirect_chain_or_loop");
  assert.equal(classifyRedirectQa({ ok: false, oldUrlStatus: 404, location: null, destinationStatus: null, reason: "old URL did not redirect" }), "source_not_redirecting");
  assert.equal(classifyRedirectQa({ ok: false, oldUrlStatus: null, location: null, destinationStatus: null, reason: "network unavailable" }), "check_unavailable");
});

test("automated QA cron authenticates before storage and records bounded deployed redirect checks", async () => {
  const findings = [
    { id: "healthy", domain: "example.com", normalized_path: "/old", suggested_target_url: "https://example.com/new" },
    { id: "broken", domain: "example.com", normalized_path: "/gone", suggested_target_url: "https://example.com/new-gone" },
    { id: "chained", domain: "example.com", normalized_path: "/chain", suggested_target_url: "https://example.com/new-chain" },
  ];
  const legacyRules = [{ id: "legacy", domain: "example.com", normalized_path: "/legacy", suggested_target_url: "https://example.com/legacy-target" }];
  const updates: { table: string; id: string; values: Record<string, unknown> }[] = [];
  let databaseCalls = 0;
  const db = { from(table: string) {
    assert.ok(table === "recovery_findings" || table === "redirect_rules");
    let selection = true;
    let id: string | null = null;
    let values: Record<string, unknown> | null = null;
    const query = {
      select() { return query; }, eq(column?: string, value?: unknown) { if (!selection && column === "id") id = String(value); return query; }, not() { return query; }, order() { return query; }, limit() { return query; },
      update(input: Record<string, unknown>) { selection = false; values = input; return query; },
      then(resolve: (value: unknown) => unknown) {
        if (selection) return Promise.resolve({ data: table === "recovery_findings" ? findings : legacyRules, error: null }).then(resolve);
        const row = values!;
        updates.push({ table, id: id ?? "unknown", values: row });
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return query;
  } } as unknown as ReturnType<typeof createServerDatabase>;
  const handler = createRecoveryQaCronHandler({
    secret: () => "cron-test-secret", database: () => { databaseCalls++; return db; }, batchSize: 3,
    now: () => new Date("2026-11-18T00:00:00.000Z"),
    verify: async source => {
      const path = new URL(source).pathname;
      if (path === "/gone") return { ok: false, oldUrlStatus: 301, location: "https://example.com/new-gone", destinationStatus: 404, reason: "The exact destination does not return HTTP 200." };
      if (path === "/chain") return { ok: false, oldUrlStatus: 301, location: "https://example.com/hop", destinationStatus: null, reason: "The redirect does not point directly to the approved target URL." };
      if (path === "/legacy") return { ok: false, oldUrlStatus: 301, location: "https://example.com/legacy-target", destinationStatus: 404, reason: "The exact destination does not return HTTP 200." };
      return { ok: true, oldUrlStatus: 301, location: "https://example.com/new", destinationStatus: 200, reason: "healthy" };
    },
  });
  const unauthorized = await handler(new Request("https://citemend.test/api/cron/recovery-qa", { method: "POST" }));
  assert.equal(unauthorized.status, 401);
  assert.equal(databaseCalls, 0);
  const response = await handler(new Request("https://citemend.test/api/cron/recovery-qa", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).counts, { healthy: 1, source_not_redirecting: 0, redirect_chain_or_loop: 1, destination_not_200: 2, check_unavailable: 0 });
  assert.equal(updates.length, 4);
  assert.ok(updates.every(update => update.values.qa_checked_at === "2026-11-18T00:00:00.000Z"));
});
