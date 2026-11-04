import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProfileCitations, synthesizeEngineProfiles } from "../lib/engine-synthesis";

test("synthesis citations must be exact grounded URLs and malformed responses fail closed", () => {
  const sources = [{ url: "https://example.com/page", title: "Page" }];
  assert.deepEqual(parseProfileCitations(JSON.stringify({ citations: ["https://example.com/page", "https://invented.example/path"] }), sources), ["https://example.com/page"]);
  assert.throws(() => parseProfileCitations('{"citations":"invalid"}', sources));
});

test("three free-provider profiles independently synthesize recency-ordered sources", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;
  process.env = { ...originalEnv, GROQ_API_KEY: "test", GEMINI_API_KEY: "" };
  const called = new Set<string>();
  globalThis.fetch = async (input, options) => {
    assert.match(String(input), /api\.groq\.com/);
    const request = JSON.parse(String(options?.body));
    assert.equal(request.model, "openai/gpt-oss-20b");
    const system = String(request.messages[0].content);
    const profile = ["Google Gemini", "Perplexity Sonar", "Claude"].find(item => system.includes(item));
    assert.ok(profile);
    called.add(profile);
    const context = JSON.parse(String(request.messages[1].content));
    assert.equal(context.sources[0].url, "https://example.com/new");
    const selected = profile === "Claude" ? "https://competitor.example/page" : "https://example.com/new";
    return Response.json({ choices: [{ message: { content: JSON.stringify({ citations: [selected, "https://invented.example/page"] }) } }] });
  };
  try {
    const [profiles] = await synthesizeEngineProfiles([{ prompt: "Find the latest guide", sources: [
      { url: "https://example.com/old", title: "Old", publishedAt: "2024-01-01" },
      { url: "https://example.com/new", title: "New", publishedAt: "2026-01-01" },
      { url: "https://competitor.example/page", title: "Other" },
    ] }]);
    assert.equal(called.size, 3);
    assert.ok(profiles.every(profile => profile.available && profile.provider === "groq-openai/gpt-oss-20b"));
    assert.deepEqual(profiles.find(profile => profile.engine === "Claude")?.urls, ["https://competitor.example/page"]);
    assert.ok(profiles.every(profile => !profile.urls.includes("https://invented.example/page")));
  } finally { globalThis.fetch = originalFetch; process.env = originalEnv; }
});

test("missing provider keys leave profiles unavailable instead of fabricating omissions", async () => {
  const originalEnv = process.env;
  process.env = { ...originalEnv, GROQ_API_KEY: "", GEMINI_API_KEY: "" };
  try {
    const [profiles] = await synthesizeEngineProfiles([{ prompt: "Find a guide", sources: [{ url: "https://example.com/page", title: "Page" }] }]);
    assert.equal(profiles.length, 3);
    assert.ok(profiles.every(profile => !profile.available && profile.urls.length === 0));
  } finally { process.env = originalEnv; }
});
