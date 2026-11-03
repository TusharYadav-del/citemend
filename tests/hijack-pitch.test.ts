import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPitchInstructions, generateHijackPitch } from "../lib/hijack-pitch";

const base = { opportunityId: "op-1", domain: "acme.com", prompt: "best project management tool", targetUrl: "https://review.example/best-tools", deadUrl: "https://rival.example/old", matchedUrl: "https://acme.com/features" };

test("dead link pitch names the cited article and replacement URL", () => {
  const prompt = buildPitchInstructions({ ...base, kind: "listicle_outbound_404" });
  assert.match(prompt, /https:\/\/rival\.example\/old/);
  assert.match(prompt, /https:\/\/review\.example\/best-tools/);
  assert.match(prompt, /https:\/\/acme\.com\/features/);
});

test("Reddit pitch requires an honest builder disclosure", () => {
  const prompt = buildPitchInstructions({ ...base, kind: "reddit_citation_thread" });
  assert.match(prompt, /Hey, I'm the builder of acme/);
  assert.match(prompt, /disclose affiliation/);
});

test("validates generated structured JSON drafts", async () => {
  const draft = await generateHijackPitch({ ...base, kind: "competitor_direct_404" }, async () => ({ draft: "Hello editor, I noticed the cited page is no longer available. Please consider this current replacement." }));
  assert.match(draft, /Hello editor/);
  await assert.rejects(generateHijackPitch({ ...base, kind: "competitor_direct_404" }, async () => ({ draft: "short" })), /invalid length/);
});
