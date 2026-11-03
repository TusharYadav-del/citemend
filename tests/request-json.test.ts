import assert from "node:assert/strict";
import { test } from "node:test";
import { readRequestJson } from "../lib/read-request-json";
import { readPricingHtmlBounded } from "../lib/entity-truth";

test("reads valid JSON, rejects malformed UTF-8, and caps streamed request bytes", async () => {
  assert.deepEqual(await readRequestJson(new Request("http://local", { method: "POST", body: JSON.stringify({ ok: true }) })), { kind: "ok", value: { ok: true } });
  assert.deepEqual(await readRequestJson(new Request("http://local", { method: "POST", body: "{" })), { kind: "invalid" });
  assert.deepEqual(await readRequestJson(new Request("http://local", { method: "POST", body: new Uint8Array([123, 34, 255, 34, 125]) })), { kind: "invalid" });
  const oversized = new Request("http://local", { method: "POST", body: JSON.stringify({ value: "x".repeat(20) }) });
  assert.deepEqual(await readRequestJson(oversized, 10), { kind: "too_large" });
});

test("pricing HTML reader enforces the body limit even without Content-Length", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(100)); controller.close(); } });
  await assert.rejects(readPricingHtmlBounded(new Response(body), 50), /50 byte analysis limit/);
  assert.equal(await readPricingHtmlBounded(new Response("<main>Pricing facts</main>"), 100), "<main>Pricing facts</main>");
});
