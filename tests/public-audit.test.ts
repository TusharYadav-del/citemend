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
    if (url.pathname.endsWith("/citation_hijack_opportunities")) {
      assert.equal(url.searchParams.get("audit_id"), "eq." + id);
      assert.equal(url.searchParams.get("limit"), "2");
      return Response.json([]);
    }
    assert.equal(url.searchParams.get("id"), "eq." + id);
    assert.equal(url.searchParams.get("status"), "in.(completed,partial,mock_completed)");
    assert.equal(url.searchParams.get("select"), "id,domain,status,created_at,share_of_model_score,engine_matrix_json,agency_brand_name,agency_logo_url,agency_primary_color,agency_cta_text,agency_cta_url,broken_links(id,cited_url,http_status,suggested_redirect)");
    return Response.json({ id, domain: "example.com", status: "partial", created_at: "2026-10-31T00:00:00Z", broken_links: [{ id: "broken", http_status: 404 }, { id: "healthy", http_status: 200 }] });
  };
  const report = await getPublicAudit(id);
  assert.equal(report?.broken_links.length, 1);
  assert.equal(report?.broken_links[0].id, "broken");
});

test("branded reports show safe saved agency details and audit-specific competitor targets", async () => {
  process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-secret" };
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/citation_hijack_opportunities")) {
      assert.equal(url.searchParams.get("audit_id"), "eq." + id);
      assert.equal(url.searchParams.get("opportunity_type"), "eq.competitor_direct_404");
      assert.ok(!url.searchParams.get("select")?.includes("outreach_draft"));
      return Response.json([{ opportunity_type: "competitor_direct_404", target_url: "https://competitor.com/old", dead_competitor_url: null, competitor_domain: "competitor.com", matched_user_live_url: "https://example.com/new", http_status: 404 }]);
    }
    return Response.json({ id, domain: "example.com", status: "completed", created_at: "2026-10-31T00:00:00Z", agency_brand_name: "Apex", agency_logo_url: "https://agency.example/logo.png", agency_primary_color: "#10B981", agency_cta_text: "Book a call", agency_cta_url: "https://agency.example/book", broken_links: [] });
  };
  const report = await getPublicAudit(id);
  assert.equal(report?.agency?.agency_brand_name, "Apex");
  assert.equal(report?.agency?.agency_cta_url, "https://agency.example/book");
  assert.equal(report?.opportunities.length, 1);
});

test("missing audits return null; database failures remain errors", async () => {
  process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-secret" };
  globalThis.fetch = async () => Response.json(null);
  assert.equal(await getPublicAudit(id), null);
  globalThis.fetch = async () => Response.json({ message: "unavailable" }, { status: 400 });
  await assert.rejects(getPublicAudit(id), /Could not load/);
});
