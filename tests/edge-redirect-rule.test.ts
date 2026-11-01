import assert from "node:assert/strict";
import test from "node:test";
import { routingPair } from "../lib/edge-redirect-rule";

test("approved suggestions produce an exact host and path lookup", () => {
  assert.deepEqual(routingPair("http://example.com/old?source=ai", "https://example.com/new", "example.com"), {
    source_host: "example.com",
    source_path: "/old",
    destination: "https://example.com/new",
  });
});

test("cross-domain, unsafe, and looping suggestions cannot be published", () => {
  for (const [source, destination, domain] of [
    ["https://other.com/old", "https://example.com/new", "example.com"],
    ["https://example.com/old", "https://other.com/new", "example.com"],
    ["https://example.com/old", "http://example.com/new", "example.com"],
    ["https://example.com/old", "https://example.com/old?loop=1", "example.com"],
    ["https://example.com/old", "https://example.com/new#fragment", "example.com"],
    ["https://example.com/old", "https://example.com/new", "example.com@other.com"],
  ]) assert.equal(routingPair(source, destination, domain), null);
});
