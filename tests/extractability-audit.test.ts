import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeExtractabilityPage, rankExtractabilityFixes, robotsAllowsAgent } from "../lib/extractability-audit";

test("robots evaluator honors specific groups, combined agents, longest path and wildcard fallback", () => {
  const robots = [
    "User-agent: GPTBot", "User-agent: PerplexityBot", "Disallow: /private", "Allow: /private/public",
    "User-agent: *", "Disallow: /all-bots",
  ].join("\n");
  assert.equal(robotsAllowsAgent(robots, "https://example.com/private/page", "GPTBot"), false);
  assert.equal(robotsAllowsAgent(robots, "https://example.com/private/public/page", "PerplexityBot"), true);
  assert.equal(robotsAllowsAgent(robots, "https://example.com/all-bots/page", "ClaudeBot"), false);
  assert.equal(robotsAllowsAgent(robots, "https://example.com/all-bots/page", "Google-Extended"), false);
  assert.equal(robotsAllowsAgent("", "https://example.com/page", "GPTBot"), true);
});

test("extractability analysis measures navigation, early answer capsule, visible date, citations, stats and stuffing", () => {
  const capsule = "Our customer support platform helps growing teams route requests, share verified answers, and monitor service quality from one workspace. Teams organize queues, track response times, and connect existing tools. This gives operators a practical way to reduce repeated work while keeping conversations accessible to the right people, without adding unnecessary complexity.";
  assert.equal(capsule.split(/\s+/).length >= 40 && capsule.split(/\s+/).length <= 60, true);
  const nav = Array.from({ length: 60 }, (_, i) => `<a href="/nav/${i}">Section ${i}</a>`).join("");
  const html = `<html><head><time datetime="2026-01-01T00:00:00Z"></time></head><body><nav>${nav}</nav><main><p>${capsule}</p><p>“A verified statement from a named source supports this product comparison with evidence.”</p><p>Usage grew 24% across 120 teams in 2025. ${"platform ".repeat(8)}Clear product details help teams evaluate options and choose a workflow that meets their needs. Additional context explains how support queues, integrations, and response measurements work for real teams.</p></main></body></html>`;
  const page = analyzeExtractabilityPage({ url: "https://example.com/guide", html, robotsText: "User-agent: GPTBot\nDisallow: /guide", now: Date.parse("2026-11-19T00:00:00Z") });
  assert.equal(page.serverRendered, true);
  assert.equal(page.navigationLinkCount, 60);
  assert.equal(page.answerCapsule.found, true);
  assert.equal(page.answerCapsule.withinFirst30Percent, true);
  assert.equal(page.staleOver90Days, true);
  assert.equal(page.robots.GPTBot, false);
  assert.ok(page.quotationDensity > 0);
  assert.ok(page.statisticDensity > 0);
  assert.equal(page.keywordStuffing.detected, true);
});

test("fix ranking is deterministic and prioritizes high-impact low-effort blockers", () => {
  const page = analyzeExtractabilityPage({ url: "https://example.com/", html: "<html><body>tiny</body></html>", status: 200, robotsText: "User-agent: GPTBot\nDisallow: /" });
  const fixes = rankExtractabilityFixes([page]);
  assert.equal(fixes[0].id, "crawler_access");
  assert.ok(fixes.every((fix, index) => index === 0 || fixes[index - 1].priority >= fix.priority));
  assert.ok(fixes.some(fix => fix.id === "ssr_content"));
});
