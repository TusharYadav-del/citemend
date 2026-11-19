import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../app/api/beta-request/route";

test("legacy beta request endpoint returns 410 without creating beta access", async () => {
  for (const response of [await GET(), await POST()]) {
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: "Beta requests are no longer available. Choose a paid plan at /pricing." });
  }
});
