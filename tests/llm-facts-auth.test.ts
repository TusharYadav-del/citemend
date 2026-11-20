import assert from "node:assert/strict";
import { test } from "node:test";
import type { auth } from "@clerk/nextjs/server";
import { createLlmFactsHandler } from "../app/api/llm-facts/route";

test("LLM facts feed rejects anonymous requests before workspace queries", async () => {
  let databaseCalls = 0;
  const get = createLlmFactsHandler({
    authenticate: async () => ({ userId: null, orgId: null, orgRole: null } as Awaited<ReturnType<typeof auth>>),
    createDatabase: (() => { databaseCalls++; throw new Error("must not query storage"); }) as never,
  });
  const response = await get(new Request("https://citemend.test/api/llm-facts?domain=shop.example"));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(databaseCalls, 0);
});
