import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { validateAgencyProfile, readAgencyProfile, type AgencyProfile } from "../lib/agency-whitelabel";
import { createWhiteLabelHandler } from "../lib/whitelabel-handler";
import { saveAgencyProfile, stampAgencyProfile } from "../lib/agency-store";

const profile = { agency_brand_name: "Apex & Partners", agency_logo_url: "https://agency.example/logo.png", agency_primary_color: "#10B981", agency_cta_text: "Book a call", agency_cta_url: "https://agency.example/book" };
const request = (domain: string, value: unknown) => new Request("https://citemend.example/api/settings/whitelabel", { method: "POST", headers: { "content-type": "application/json", origin: "https://citemend.example" }, body: JSON.stringify({ domain, profile: value }) });

test("agency profile validation rejects unsafe URLs and invalid or incomplete settings", () => {
  assert.deepEqual(validateAgencyProfile(profile), profile);
  for (const invalid of [{ ...profile, agency_logo_url: "javascript:alert(1)" }, { ...profile, agency_cta_url: "http://localhost/book" }, { ...profile, agency_cta_url: "https://127.0.0.1/book" }, { ...profile, agency_primary_color: "red;evil" }, { ...profile, agency_cta_url: "" }, { ...profile, agency_brand_name: "" }]) assert.throws(() => validateAgencyProfile(invalid));
  assert.equal(readAgencyProfile({ ...profile, agency_cta_url: "javascript:alert(1)" }), null);
});

test("white-label settings require paid access and an owned domain before saving", async () => {
  let saved: unknown;
  const deps = { user: async () => "owner", eligible: async () => true, owns: async (_user: string, domain: string) => domain === "example.com", get: async () => null, save: async (user: string, domain: string, value: AgencyProfile) => { saved = { user, domain, value }; } };
  const denied = createWhiteLabelHandler({ ...deps, eligible: async () => false });
  assert.equal((await denied(request("example.com", profile))).status, 403);
  const handler = createWhiteLabelHandler(deps);
  assert.equal((await handler(request("other.com", profile))).status, 404);
  assert.equal((await handler(request("example.com", { ...profile, agency_cta_url: "javascript:x" }))).status, 400);
  assert.equal((await handler(request("example.com", profile))).status, 200);
  assert.deepEqual(saved, { user: "owner", domain: "example.com", value: profile });
});

test("saving a profile preserves other integration fields and stamping scopes the audit to its owner", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;
  process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-secret" };
  const writes: { url: URL; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    if (options?.method === "PATCH") { writes.push({ url, body: JSON.parse(String(options.body)) }); return new Response(null, { status: 204 }); }
    if (url.pathname.endsWith("/workspace_integrations") && url.searchParams.get("select") === "id") return Response.json({ id: "existing" });
    if (url.pathname.endsWith("/workspace_integrations")) return Response.json(profile);
    throw new Error("Unexpected request");
  };
  try {
    await saveAgencyProfile("owner", "example.com", profile);
    await stampAgencyProfile("owner", "example.com", "audit-id");
    assert.equal(writes.length, 2);
    assert.equal(writes[0].url.searchParams.get("user_id"), "eq.owner");
    assert.equal(writes[0].url.searchParams.get("domain"), "eq.example.com");
    assert.equal("slack_webhook_url" in writes[0].body, false);
    assert.equal(writes[1].url.searchParams.get("id"), "eq.audit-id");
    assert.equal(writes[1].url.searchParams.get("user_id"), "eq.owner");
    assert.equal(writes[1].body.agency_brand_name, "Apex & Partners");
  } finally { globalThis.fetch = originalFetch; process.env = originalEnv; }
});

test("public report renders the agency name, logo, CTA and print control", () => {
  const output = execFileSync(process.execPath, ["--require", "./scripts/test-userinfo-fallback.cjs", "--import", "tsx", "tests/helpers/render-agency-report.tsx"], { encoding: "utf8", timeout: 15_000 });
  assert.match(output, /Apex &amp; Partners/);
  assert.match(output, /https:\/\/agency\.example\/logo\.png/);
  assert.match(output, /https:\/\/agency\.example\/book/);
  assert.match(output, /Export Report \/ Save as PDF/);
  assert.ok(!output.includes("CITEMEND"));
});
