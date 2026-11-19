import assert from "node:assert/strict";
import { test } from "node:test";
import { filterPublicSitemapAudits } from "../app/sitemap";

test("mock_completed audits never enter the public sitemap", () => {
  const rows = [
    { id: "real-complete", status: "completed" },
    { id: "real-partial", status: "partial" },
    { id: "mock", status: "mock_completed" },
  ];
  assert.deepEqual(filterPublicSitemapAudits(rows).map(row => row.id), ["real-complete", "real-partial"]);
});
