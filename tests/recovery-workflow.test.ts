import assert from "node:assert/strict";
import { test } from "node:test";
import { createRecoveryApproveHandler, createRecoveryRollbackHandler } from "../lib/recovery-workflow";
import type { createServerDatabase } from "../lib/supabase-server";

const linkId = "d98a5c0a-01a9-4d17-a9b1-2df80515548c";
const auditId = "6c4c2f50-56a9-4d66-a462-4dbfa68ee4b1";
const baseLink = {
  id: linkId, audit_id: auditId, cited_url: "https://acme.com/old", http_status: 404, url_state: "404",
  suggested_redirect: "https://acme.com/new", approval_status: "pending_review", match_confidence: 78,
  match_evidence_reason: "semantic candidate", previous_destination_url: null,
  audits: { user_id: "owner", domain: "acme.com" },
};

function setup(link = baseLink, rule: Record<string, unknown> | null = null, integration: Record<string, unknown> | null = null) {
  const updates: { table: string; value: Record<string, unknown> }[] = [];
  const db = { from(table: string) {
    let updateValue: Record<string, unknown> | null = null;
    const query = {
      select() { return query; },
      eq() { return query; },
      update(value: Record<string, unknown>) { updateValue = value; updates.push({ table, value }); return query; },
      maybeSingle: async () => ({ data: table === "broken_links" ? link : table === "redirect_rules" ? rule : table === "workspace_integrations" ? integration : null, error: null }),
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: null, error: null, updateValue }).then(resolve); },
    };
    return query;
  } };
  return { db: db as unknown as ReturnType<typeof createServerDatabase>, updates };
}
const request = (body: object) => new Request("https://citemend.test/api/recovery", { method: "POST", body: JSON.stringify(body) });
const http200 = async () => ({ state: "200" as const, httpStatus: 200 });

test("low similarity blocks approval of the candidate until a manual mapping is supplied", async () => {
  const { db, updates } = setup({ ...baseLink, match_confidence: 69 });
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: http200 });
  const preview = await handler(request({ linkId, action: "preview" }));
  assert.equal(preview.status, 409);
  assert.equal((await preview.json()).code, "MANUAL_MAPPING_REQUIRED");
  assert.equal(updates.length, 0);
});

test("an explicit manual mapping can be previewed and approved without reusing a low similarity score", async () => {
  const { db, updates } = setup({ ...baseLink, match_confidence: 62 });
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: http200, previewSecret: () => "test-recovery-preview-secret-that-is-long-enough" });
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
});

test("medium scores need a successful preview and explicit human confirmation", async () => {
  const { db, updates } = setup();
  let checks = 0;
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: async url => { checks++; assert.equal(url, baseLink.suggested_redirect); return http200(); }, previewSecret: () => "test-recovery-preview-secret-that-is-long-enough" });
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
  const handler = createRecoveryApproveHandler({ getUserId: async () => "owner", database: () => db, verify: async () => ({ state: "301", httpStatus: 301 }) });
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
