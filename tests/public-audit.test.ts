import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getPublicAudit } from "../lib/public-audit";

const originalFetch = globalThis.fetch;
const originalEnv = process.env;
afterEach(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });
const id = "9234a138-b3aa-46dd-bf79-b5800876a89d";

test("invalid UUIDs never access the database", async () => {
  globalThis.fetch = async () => { throw new Error("Unexpected database access"); };
  for (const value of ["invalid", "", id + "?select=*", "../dashboard"]) assert.equal(await getPublicAudit(value), null);
});

test("public lookup selects only report fields and the exact UUID, and excludes non-404 rows", async () => {
  process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-secret" };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("id"), "eq." + id);
    assert.equal(url.searchParams.get("status"), "in.(completed,partial,mock_completed)");
    assert.equal(url.searchParams.get("select"), "id,domain,status,created_at,share_of_model_score,engine_matrix_json,broken_links(id,cited_url,http_status,suggested_redirect)");
    return Response.json({ id, domain: "example.com", status: "partial", created_at: "2026-10-31T00:00:00Z", broken_links: [{ id: "broken", http_status: 404 }, { id: "healthy", http_status: 200 }] });
  };
  const report = await getPublicAudit(id);
  assert.equal(report?.broken_links.length, 1);
  assert.equal(report?.broken_links[0].id, "broken");
});

test("missing audits return null; database failures remain errors", async () => {
  process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-secret" };
  globalThis.fetch = async () => Response.json(null);
  assert.equal(await getPublicAudit(id), null);
  globalThis.fetch = async () => Response.json({ message: "unavailable" }, { status: 400 });
  await assert.rejects(getPublicAudit(id), /Could not load/);
});
