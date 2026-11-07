import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { runAudit, validateAuditInput } from "../lib/audit-pipeline";
import { verifyUrl } from "../lib/seo";
import { resolvePublicHost } from "../lib/public-http";
import { routingPair } from "../lib/edge-redirect-rule";
import { assessTechnicalDeployment, observationCitesCanonical, outcomeMilestones } from "../lib/outcome-verifier";

afterEach(() => mock.restoreAll());

async function migratedDatabase() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$; grant usage on schema auth to authenticated, service_role; grant execute on function auth.jwt() to authenticated, service_role;");
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d{3}_.+\.sql$/.test(name)).sort();
  for (const file of files) await db.exec(await readFile(new URL(file, directory), "utf8"));
  return db;
}

test("First 30-Day Definition of Done runs through audit, SSRF, recovery, milestones, and reproducible evidence", async t => {
  const previousPersistenceMode = process.env.AUDIT_PERSISTENCE_MODE;
  delete process.env.AUDIT_PERSISTENCE_MODE;
  t.after(() => { if (previousPersistenceMode === undefined) delete process.env.AUDIT_PERSISTENCE_MODE; else process.env.AUDIT_PERSISTENCE_MODE = previousPersistenceMode; });

  await t.test("1. a connected public website can produce a useful persisted audit", async () => {
    let savedReport: unknown;
    let probed = 0;
    const input = validateAuditInput({ domain: "example.com", buyerPrompts: ["best support platform", "compare support platforms"] });
    assert.equal(input.domain, "example.com");
    const result = await runAudit(input, {
      probe: async (_domain, prompt) => { probed++; return { text: `${prompt}: https://example.com/pricing`, citedUrls: ["https://example.com/pricing"], providerUsed: "test-search", searchGrounding: { status: "available", sources: [{ url: "https://example.com/pricing", title: "Pricing" }] }, warnings: [] }; },
      sitemap: async domain => [`https://${domain}/pricing`],
      check: async () => 200,
      semantic: null,
      synthesize: null,
      resolve: async url => url,
      saveGap: async () => {},
      save: async report => { savedReport = report; return { id: "10000000-0000-4000-8000-000000000001", createdAt: "2026-11-07T00:00:00.000Z" }; },
    }, "dod_customer");
    assert.equal(probed, 2);
    assert.equal(result.persistence.status, "saved");
    assert.equal(result.status, "completed");
    assert.equal(result.findings[0]?.urlState, "200");
    assert.match(result.generatedText, /best support platform/);
    assert.ok(savedReport);
  });

  await t.test("2. eight-state URL verification rejects unsafe DNS destinations", async () => {
    const statuses: Record<string, number> = { "/ok": 200, "/moved": 301, "/missing": 404, "/gone": 410, "/other": 503 };
    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/slow") throw new DOMException("The operation timed out", "TimeoutError");
      if (url.pathname === "/unknown") throw new Error("temporary socket failure");
      return new Response(null, { status: statuses[url.pathname] ?? 200 });
    });
    const states = await Promise.all(["/ok", "/moved", "/missing", "/gone", "/other", "/slow", "/unknown"].map(path => verifyUrl(`https://example.com${path}`)));
    assert.deepEqual(states.map(item => item.state), ["200", "301", "404", "410", "unknown", "timeout", "unknown"]);
    assert.equal((await verifyUrl("ftp://example.com/path")).state, "hallucinated");
    assert.equal((await verifyUrl("http://127.0.0.1/private")).state, "blocked");
    await assert.rejects(resolvePublicHost("localhost"), /non-public/);
  });

  const db = await migratedDatabase();
  t.after(async () => { await db.close(); });

  await t.test("3. redirect guards and immutable audit logs cover preview, approval, deployment, and rollback", async () => {
    const source = "https://example.com/old-guide";
    const destination = "https://example.com/new-guide";
    const pair = routingPair(source, destination, "example.com");
    assert.ok(pair);
    assert.equal(routingPair(source, "https://attacker.test/landing", "example.com"), null);
    assert.equal(routingPair(source, source, "example.com"), null);
    assert.equal(assessTechnicalDeployment({ approved: true, source404: true, destinationStatus: 200, sameDomain: true, noLoop: true, noConflict: true }), true);
    assert.equal(assessTechnicalDeployment({ approved: true, source404: true, destinationStatus: 200, sameDomain: true, noLoop: false, noConflict: true }), false);
    const audit = "10000000-0000-4000-8000-000000000001";
    const broken = "20000000-0000-4000-8000-000000000001";
    await db.exec(`insert into public.audits(id,user_id,domain,status,buyer_prompt) values ('${audit}','dod_customer','example.com','completed','best support platform')`);
    await db.exec(`insert into public.broken_links(id,audit_id,cited_url,http_status,suggested_redirect,url_state,approval_status,match_confidence) values ('${broken}','${audit}','${source}',404,'${destination}','404','pending_review',92)`);
    const actions = ["redirect_preview", "redirect_approval", "redirect_deployment", "redirect_rollback"];
    for (let index = 0; index < actions.length; index++) await db.query(
      "insert into public.action_audit_logs(workspace_domain,actor_user_id,action_type,target_url,previous_state_json,new_state_json,safety_check_passed,created_at) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)",
      ["example.com", "dod_customer", actions[index], destination, JSON.stringify({ step: index }), JSON.stringify({ step: index + 1 }), true, `2026-11-07T00:0${index}:00Z`],
    );
    const log = await db.query<{ action_type: string; safety_check_passed: boolean }>("select action_type,safety_check_passed from public.action_audit_logs where workspace_domain='example.com' order by created_at");
    assert.deepEqual(log.rows.map(row => row.action_type), actions);
    assert.ok(log.rows.every(row => row.safety_check_passed));
    await assert.rejects(db.exec("update public.action_audit_logs set safety_check_passed=false"), /append-only/);
  });

  await t.test("4. technical deployment and later AI citation are separate milestones", async () => {
    const audit = "10000000-0000-4000-8000-000000000001";
    const broken = "20000000-0000-4000-8000-000000000001";
    const verifiedAt = "2026-11-07T00:10:00.000Z";
    assert.deepEqual(outcomeMilestones({ technicalVerifiedAt: verifiedAt }), {
      technical_deployment_verified: true, ai_citation_observed: false, technical_verified_at: verifiedAt, ai_citation_observed_at: null,
    });
    await db.query("insert into public.recovery_outcomes(audit_id,domain,broken_link_id,canonical_destination_url,technical_deployment_verified_at) values ($1,$2,$3,$4,$5)", [audit, "example.com", broken, "https://example.com/new-guide", verifiedAt]);
    const before = await db.query<{ technical_deployment_verified_at: string; ai_citation_observed_at: string | null }>("select technical_deployment_verified_at,ai_citation_observed_at from public.recovery_outcomes where audit_id=$1", [audit]);
    assert.equal(new Date(before.rows[0].technical_deployment_verified_at).toISOString(), verifiedAt);
    assert.equal(before.rows[0].ai_citation_observed_at, null);
    assert.equal(observationCitesCanonical({ technicalVerified: true, observationAt: "2026-11-07T00:15:00Z", technicalVerifiedAt: verifiedAt, extractedUrls: ["https://example.com/new-guide#section"], canonicalUrl: "https://example.com/new-guide" }), true);
    await db.exec("insert into public.ai_observation_evidence(audit_id,domain,prompt_query,prompt_version,provider,model_name,search_method,locale,raw_answer,extracted_urls_json,sample_size,observed_at) values ('10000000-0000-4000-8000-000000000001','example.com','best support platform','v1','test-provider','test-model','live_search','en-US','The recovered product page is the source: https://example.com/new-guide','[\"https://example.com/new-guide\"]',3,'2026-11-07T00:15:00Z')");
    await db.exec("update public.recovery_outcomes set ai_citation_observed_at='2026-11-07T00:15:00Z', evidence_id=(select id from public.ai_observation_evidence where audit_id='10000000-0000-4000-8000-000000000001') where audit_id='10000000-0000-4000-8000-000000000001'");
    const after = await db.query<{ technical_deployment_verified_at: string; ai_citation_observed_at: string | null; evidence_id: string | null }>("select technical_deployment_verified_at,ai_citation_observed_at,evidence_id from public.recovery_outcomes where audit_id=$1", [audit]);
    assert.equal(new Date(after.rows[0].technical_deployment_verified_at).toISOString(), verifiedAt);
    assert.equal(new Date(String(after.rows[0].ai_citation_observed_at)).toISOString(), "2026-11-07T00:15:00.000Z");
    assert.ok(after.rows[0].evidence_id);
  });

  await t.test("5. design-partner feedback and reproducible observation provenance persist", async () => {
    await db.query("insert into public.design_partner_applications(contact_name,contact_email,company_name,domain,segment,client_or_catalog_size,buyer_prompt,primary_pain_point,teaser_status,teaser_json) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)", ["Test Partner", "partner@example.com", "Example Company", "example.com", "saas", 12, "best support platform for startups", "AI answers cite stale and broken product pages", "complete", JSON.stringify({ findings: 1 })]);
    const application = await db.query<{ segment: string; client_or_catalog_size: number; buyer_prompt: string; primary_pain_point: string }>("select segment,client_or_catalog_size,buyer_prompt,primary_pain_point from public.design_partner_applications where contact_email='partner@example.com'");
    assert.deepEqual(application.rows[0], { segment: "saas", client_or_catalog_size: 12, buyer_prompt: "best support platform for startups", primary_pain_point: "AI answers cite stale and broken product pages" });
    const evidence = await db.query<{ raw_answer: string; provider: string; model_name: string; locale: string; observed_at: string; sample_size: number }>("select raw_answer,provider,model_name,locale,observed_at,sample_size from public.ai_observation_evidence where audit_id='10000000-0000-4000-8000-000000000001'");
    assert.equal(evidence.rows.length, 1);
    assert.deepEqual({ ...evidence.rows[0], observed_at: new Date(evidence.rows[0].observed_at).toISOString() }, { raw_answer: "The recovered product page is the source: https://example.com/new-guide", provider: "test-provider", model_name: "test-model", locale: "en-US", observed_at: "2026-11-07T00:15:00.000Z", sample_size: 3 });
  });
});
