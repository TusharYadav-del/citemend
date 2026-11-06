import assert from "node:assert/strict";
import { test } from "node:test";
import { createRecoveryApproveHandler, createRecoveryRollbackHandler } from "../lib/recovery-workflow";
import type { createServerDatabase } from "../lib/supabase-server";

const linkId = "d98a5c0a-01a9-4d17-a9b1-2df80515548c";
const auditId = "6c4c2f50-56a9-4d66-a462-4dbfa68ee4b1";
const baseLink = {
  id: linkId, audit_id: auditId, cited_url: "https://acme.com/old", http_status: 404, url_state: "404",
  suggested_redirect: "https://acme.com/new", approval_status: "pending_review", approved_by: null as string | null, match_confidence: 78,
  match_evidence_reason: "semantic candidate", previous_destination_url: null,
  audits: { user_id: "owner", domain: "acme.com" },
};

function setup(link = baseLink, rule: Record<string, unknown> | null = null, integration: Record<string, unknown> | null = null, policy: Record<string, unknown> | null = null, membership: Record<string, unknown> | null = null) {
  const updates: { table: string; value: Record<string, unknown> }[] = [];
  const logs: Record<string, unknown>[] = [];
  const db = { from(table: string) {
    let updateValue: Record<string, unknown> | null = null;
    const filters: Record<string, unknown> = {};
    const query = {
      select() { return query; },
      eq(column: string, value: unknown) { filters[column] = value; return query; },
      is(column: string, value: unknown) { filters[column] = value; return query; },
      in() { return query; },
      limit() { return query; },
      insert(value: Record<string, unknown>) { logs.push(value); return Promise.resolve({ error: null }); },
      update(value: Record<string, unknown>) { updateValue = value; updates.push({ table, value }); return query; },
      maybeSingle: async () => ({ data: table === "broken_links" ? link : table === "redirect_rules" ? rule : table === "workspace_integrations" ? integration : table === "workspace_governance_policies" ? policy : table === "organization_members" ? membership : null, error: null }),
      then(resolve: (value: unknown) => unknown) { const data = table === "broken_links" && updateValue?.approval_status === "approved" ? [{ id: linkId }] : table === "redirect_rules" && filters.source_host && rule ? [rule] : null; return Promise.resolve({ data, error: null, updateValue }).then(resolve); },
    };
    return query;
  } };
  return { db: db as unknown as ReturnType<typeof createServerDatabase>, updates, logs };
}
const request = (body: object) => new Request("https://citemend.test/api/recovery", { method: "POST", body: JSON.stringify(body) });
const checkedUrl = async (url: string) => url.endsWith("/old") ? ({ state: "404" as const, httpStatus: 404 }) : ({ state: "200" as const, httpStatus: 200 });
const safeTrace = async (url: string) => ({ status: 200, visitedUrls: [url], finalUrl: url });

test("low similarity blocks approval of the candidate until a manual mapping is supplied", async () => {
  const { db, updates } = setup({ ...baseLink, match_confidence: 69 });
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: checkedUrl, trace: safeTrace });
  const preview = await handler(request({ linkId, action: "preview" }));
  assert.equal(preview.status, 409);
  assert.equal((await preview.json()).code, "MANUAL_MAPPING_REQUIRED");
  assert.equal(updates.length, 0);
});

test("two-person policy records a first approval and leaves the redirect pending", async () => {
  const { db, updates, logs } = setup({ ...baseLink, match_confidence: 90 }, null, null, { require_two_person_redirect_approval: true }, { owner_user_id: "owner", role: "admin" });
  const handler = createRecoveryApproveHandler({ getUserId: async () => "reviewer-one", getOrganizationSession: async () => ({ organizationId: "org", role: "admin" }), database: () => db, verify: checkedUrl, trace: safeTrace });
  const response = await handler(request({ linkId, action: "approve" }));
  assert.equal(response.status, 202);
  assert.equal((await response.json()).awaitingSecondApprover, true);
  assert.equal(updates.at(-1)?.value.approved_by, "reviewer-one");
  assert.equal(updates.at(-1)?.value.approval_status, undefined);
  assert.equal(logs.at(-1)?.action_type, "redirect_first_approval");
});

test("two-person policy allows a distinct authorized administrator to finalize approval", async () => {
  const { db, updates, logs } = setup({ ...baseLink, approved_by: "reviewer-one", match_confidence: 90 }, null, null, { require_two_person_redirect_approval: true }, { owner_user_id: "owner", role: "admin" });
  const handler = createRecoveryApproveHandler({ getUserId: async () => "reviewer-two", getOrganizationSession: async () => ({ organizationId: "org", role: "admin" }), database: () => db, verify: checkedUrl, trace: safeTrace });
  const response = await handler(request({ linkId, action: "approve" }));
  assert.equal(response.status, 200);
  assert.equal(updates.at(-1)?.value.approved_by, "reviewer-two");
  assert.equal(updates.at(-1)?.value.approval_status, "approved");
  assert.equal(logs.at(-1)?.action_type, "redirect_approval");
});

test("two-person policy rejects the first approver attempting to approve again", async () => {
  const { db, updates } = setup({ ...baseLink, approved_by: "reviewer-one", match_confidence: 90 }, null, null, { require_two_person_redirect_approval: true }, { owner_user_id: "owner", role: "admin" });
  const handler = createRecoveryApproveHandler({ getUserId: async () => "reviewer-one", getOrganizationSession: async () => ({ organizationId: "org", role: "admin" }), database: () => db, verify: checkedUrl, trace: safeTrace });
  const response = await handler(request({ linkId, action: "approve" }));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /different authorized administrator/);
  assert.equal(updates.some(update => update.value.approval_status === "approved"), false);
});

test("an explicit manual mapping can be previewed and approved without reusing a low similarity score", async () => {
  const { db, updates, logs } = setup({ ...baseLink, match_confidence: 62 });
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: checkedUrl, trace: safeTrace, previewSecret: () => "test-recovery-preview-secret-that-is-long-enough" });
  const destinationUrl = "https://acme.com/manual-page";
  const preview = await handler(request({ linkId, action: "preview", destinationUrl }));
  const previewData = (await preview.json()).preview;
  assert.equal(preview.status, 200);
  assert.equal(previewData.manualMapping, true);
  assert.equal(previewData.similarityScore, null);
  assert.equal((await handler(request({ linkId, action: "approve", destinationUrl, reviewConfirmed: true }))).status, 409);
  assert.equal((await handler(request({ linkId, action: "approve", destinationUrl, reviewConfirmed: true, previewToken: previewData.previewToken }))).status, 200);
  assert.equal(updates.at(-1)?.value.suggested_redirect, destinationUrl);
  assert.equal(updates.at(-1)?.value.match_confidence, null);
  assert.equal(logs.filter(item => item.action_type === "redirect_preview").length, 1);
  assert.equal(logs.filter(item => item.action_type === "redirect_approval").length, 1);
});

test("medium scores need a successful preview and explicit human confirmation", async () => {
  const { db, updates } = setup();
  let checks = 0;
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: async url => { checks++; return url.endsWith("/old") ? { state: "404", httpStatus: 404 } : { state: "200", httpStatus: 200 }; }, trace: safeTrace, previewSecret: () => "test-recovery-preview-secret-that-is-long-enough" });
  const preview = await handler(request({ linkId, action: "preview" }));
  assert.equal(preview.status, 200);
  const previewData = (await preview.json()).preview;
  assert.equal(previewData.scoreMeaning, "ranking signal, not probability");
  assert.equal((await handler(request({ linkId, action: "approve", reviewConfirmed: true }))).status, 409);
  assert.equal((await handler(request({ linkId, action: "approve", reviewConfirmed: true, previewToken: previewData.previewToken }))).status, 200);
  assert.equal(checks, 3);
  assert.equal(updates.at(-1)?.value.approval_status, "approved");
  assert.equal(updates.at(-1)?.value.approved_by, "owner");
});

test("high confidence is eligible for one-click approval but still requires HTTP 200", async () => {
  const { db, updates } = setup({ ...baseLink, match_confidence: 91 });
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: checkedUrl, trace: async url => ({ status: 301, visitedUrls: [url], finalUrl: url }) });
  assert.equal((await handler(request({ linkId, action: "approve" }))).status, 422);
  assert.equal(updates.length, 0);
});

test("rollback disables a locally active redirect and records lifecycle state", async () => {
  const { db, updates } = setup({ ...baseLink, approval_status: "deployed" }, { id: "rule", user_id: "owner", active: true, is_active: true, synced_to_cms: false, target_url: baseLink.suggested_redirect, destination: baseLink.suggested_redirect });
  const handler = createRecoveryRollbackHandler({ getUserId: async () => "owner", database: () => db });
  const response = await handler(request({ linkId }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).localRedirectActive, false);
  assert.ok(updates.some(update => update.table === "redirect_rules" && update.value.active === false && update.value.is_active === false));
  assert.ok(updates.some(update => update.table === "broken_links" && update.value.approval_status === "rolled_back" && typeof update.value.rolled_back_at === "string"));
});

test("rollback removes a tracked Shopify redirect before changing local state", async () => {
  const { db, updates } = setup({ ...baseLink, approval_status: "deployed" }, { id: "rule", user_id: "owner", active: true, synced_to_cms: true, shopify_redirect_id: "123", target_url: baseLink.suggested_redirect, destination: baseLink.suggested_redirect }, { shopify_store_domain: "shop.myshopify.com", shopify_admin_token: "token" });
  const deleted: string[] = [];
  const handler = createRecoveryRollbackHandler({ getUserId: async () => "owner", database: () => db, deleteShopify: async (_store, _token, id) => { deleted.push(id); } });
  assert.equal((await handler(request({ linkId }))).status, 200);
  assert.deepEqual(deleted, ["123"]);
  assert.ok(updates.some(update => update.table === "redirect_rules" && update.value.shopify_redirect_id === null));
});

test("approval endpoints reject unauthenticated requests without touching storage", async () => {
  const handler = createRecoveryApproveHandler({ getUserId: async () => null, database: () => { throw new Error("database should not be created"); } });
  assert.equal((await handler(request({ linkId, action: "preview" }))).status, 401);
});

test("approval rejects off-domain mappings and logs canonical overwrite conflicts", async () => {
  const { db, logs } = setup();
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: async url => url.endsWith("/old") ? { state: "200", httpStatus: 200 } : { state: "200", httpStatus: 200 }, trace: safeTrace });
  assert.equal((await handler(request({ linkId, action: "approve", destinationUrl: "https://attacker.test/collect" }))).status, 422);
  assert.equal((await handler(request({ linkId, action: "approve" }))).status, 409);
  assert.equal(logs.filter(item => item.action_type === "redirect_conflict_rejection").length, 2);
  assert.ok(logs.every(item => item.safety_check_passed === false));
});

test("approval rejects destination chains that return to the broken source and logs the conflict", async () => {
  const { db, logs } = setup({ ...baseLink, match_confidence: 90 });
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: checkedUrl, trace: async url => ({ status: 404, visitedUrls: [url, "https://acme.com/old"], finalUrl: "https://acme.com/old" }) });
  assert.equal((await handler(request({ linkId, action: "approve" }))).status, 422);
  assert.equal(logs[0].action_type, "redirect_conflict_rejection");
});

test("approval rejects a chain that exits the canonical domain", async () => {
  const { db, logs } = setup({ ...baseLink, match_confidence: 90 });
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: checkedUrl, trace: async url => ({ status: 200, visitedUrls: [url, "https://elsewhere.example/page"], finalUrl: "https://elsewhere.example/page" }) });
  assert.equal((await handler(request({ linkId, action: "approve" }))).status, 422);
  assert.match(String(logs[0].new_state_json && (logs[0].new_state_json as { reason?: string }).reason), /leaves the verified canonical domain/);
});

test("approval rejects an existing active redirect conflict", async () => {
  const otherRule = { id: "other", user_id: "owner", source_link_id: "another-link", source_host: "acme.com", source_path: "/old", active: true, is_active: true, destination: "https://acme.com/different", target_url: "https://acme.com/different" };
  const { db, logs } = setup({ ...baseLink, match_confidence: 90 }, otherRule);
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: checkedUrl, trace: safeTrace });
  assert.equal((await handler(request({ linkId, action: "approve" }))).status, 409);
  assert.match(String((logs[0].new_state_json as { reason: string }).reason), /active redirect/);
});
