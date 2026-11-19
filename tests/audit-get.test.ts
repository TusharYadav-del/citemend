import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../app/api/audit/route";

test("GET /api/audit clearly directs callers to POST instead of reporting a placeholder", async () => {
  const response = await GET();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.deepEqual(await response.json(), { error: "Use POST /api/audit to run an audit" });
});
