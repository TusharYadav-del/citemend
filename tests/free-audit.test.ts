import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { reserveFreeAudit, releaseFreeAudit } from "../lib/free-audit";

const oldFetch = globalThis.fetch;
const oldEnv = process.env;
afterEach(() => { globalThis.fetch = oldFetch; process.env = oldEnv; });

test("one database reservation wins concurrent free-audit requests and release is scoped to its token", async () => {
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key" };
  let row: { id: string; user_id: string; status: string; created_at: string } | null = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      assert.equal(url.searchParams.get("user_id"), "eq.user_123");
      return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body));
      if (row) return Response.json({ code: "23505", message: "duplicate" }, { status: 409 });
      row = body;
      return new Response(null, { status: 201 });
    }
    if (method === "GET") return Response.json(row ? [row] : []);
    if (method === "DELETE") {
      assert.equal(url.searchParams.get("user_id"), "eq.user_123");
      if (row && url.searchParams.get("created_at") === `eq.${row.created_at}`) row = null;
      return new Response(null, { status: 204 });
    }
    throw new Error("Unexpected request");
  };
  const results = await Promise.all([reserveFreeAudit("user_123", "example.com"), reserveFreeAudit("user_123", "example.com")]);
  const winner = results.find((result) => result.kind === "reserved");
  assert.ok(winner && winner.kind === "reserved");
  assert.equal(results.filter((result) => result.kind === "reserved").length, 1);
  assert.equal(results.filter((result) => result.kind === "busy").length, 1);
  await releaseFreeAudit("user_123", winner.id, "2020-01-01T00:00:00Z");
  assert.notEqual(row, null);
  await releaseFreeAudit("user_123", winner.id, winner.createdAt);
  assert.equal(row, null);
});
test("saving a reserved free audit claims the exact pending slot before recording findings", async () => {
  const { persistAudit } = await import("../lib/audit-store");
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-server-key" };
  const createdAt = "2026-11-01T00:00:00.000Z";
  const statuses: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      statuses.push(body.status);
      assert.equal(url.searchParams.get("id"), "eq.reserved-id");
      assert.equal(url.searchParams.get("user_id"), "eq.user_123");
      assert.equal(url.searchParams.get("created_at"), "eq." + createdAt);
      if (body.status === "free_saving") {
        assert.equal(url.searchParams.get("status"), "eq.free_pending");
        return Response.json({ id: "reserved-id", created_at: createdAt });
      }
      assert.equal(url.searchParams.get("status"), "eq.free_saving");
      return new Response(null, { status: 204 });
    }
    if (method === "GET") return Response.json({ id: "reserved-id", user_id: "user_123", status: "completed", broken_links: [] });
    throw new Error("Unexpected request");
  };
  const report: Parameters<typeof persistAudit>[0] = { domain: "example.com", buyerPrompt: "Find docs", generatedText: "", groundingMetadata: null, extractedUrls: [], sitemapUrlCount: 0, warnings: [], status: "completed", findings: [] };
  const saved = await persistAudit(report, "user_123", { id: "reserved-id", createdAt });
  assert.equal(saved.id, "reserved-id");
  assert.deepEqual(statuses, ["free_saving", "completed"]);
});
