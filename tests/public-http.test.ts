import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import dns from "node:dns/promises";
import { assertPublicUrl, isPublicAddress, resolvePublicHost } from "../lib/public-http";
afterEach(() => mock.restoreAll());
test("rejects private, metadata, mapped IPv6, alternate-IP and reserved destinations", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.equal(isPublicAddress(address), false, address);
  for (const url of ["http://127.1", "http://0x7f000001", "http://[::ffff:127.0.0.1]", "http://localhost.", "https://user:secret@example.com", "http://example.com:8080"]) assert.throws(() => assertPublicUrl(url));
  assert.equal(isPublicAddress("8.8.8.8"), true);
});
test("rejects private or mixed DNS answers, including metadata redirects", async () => {
  mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }, { address: "169.254.169.254", family: 4 }]);
  await assert.rejects(resolvePublicHost("attacker.example"), /non-public/);
});
test("returns the exact validated public addresses for the connection lookup", async () => {
  const addresses = [{ address: "8.8.8.8", family: 4 }];
  let calls = 0;
  mock.method(dns, "lookup", async () => { calls++; return addresses; });
  assert.deepEqual(await resolvePublicHost("example.com"), addresses);
  assert.equal(calls, 1);
});

test("native HTTP connections reject a hostname whose DNS resolves privately", async () => {
  const { publicFetch } = await import("../lib/public-http");
  mock.method(dns, "lookup", async () => [{ address: "127.0.0.1", family: 4 }]);
  await assert.rejects(publicFetch("http://rebinding-test.example/", {signal: AbortSignal.timeout(1000)}), (error: unknown) => error instanceof Error && error.cause instanceof Error && /non-public/.test(error.cause.message));
});
