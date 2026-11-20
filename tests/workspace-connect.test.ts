import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceConnectHandler } from "../lib/workspace-connect";
import { mergeWorkspaceDomain } from "../lib/workspace-domain";

test("connecting a bare domain persists and immediately selects its workspace", async () => {
  const saved: Array<{ ownerUserId: string; domain: string }> = [];
  const handler = createWorkspaceConnectHandler({
    authenticate: async () => ({ userId: "user_123", ownerUserId: "owner_123", role: "owner" }),
    save: async (ownerUserId, domain) => { saved.push({ ownerUserId, domain }); },
  });
  const response = await handler(new Request("https://app.example/api/workspaces/connect", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: "  MyStore.com  " }),
  }));
  assert.equal(response.status, 201);
  assert.deepEqual(saved, [{ ownerUserId: "owner_123", domain: "mystore.com" }]);
  const { domains, domain } = mergeWorkspaceDomain([], (await response.json()).domain);
  assert.equal(domain, "mystore.com");
  assert.deepEqual(domains, ["mystore.com"]);
  assert.notEqual(domain, ""); // The empty "No workspace selected" state is cleared.
});

test("workspace connect reports storage failures to the caller", async () => {
  const handler = createWorkspaceConnectHandler({
    authenticate: async () => ({ userId: "user_123", role: "owner" }),
    save: async () => { throw new Error("Supabase unavailable"); },
  });
  const response = await handler(new Request("https://app.example/api/workspaces/connect", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: "mystore.com" }),
  }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Supabase unavailable/);
});
