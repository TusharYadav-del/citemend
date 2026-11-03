import assert from "node:assert/strict";
import { test } from "node:test";
import { exportSyncRules, pushShopifyRedirect, type SyncRule } from "../lib/redirect-sync";
import { alertPayload, sendWorkspaceWebhook } from "../lib/alerts";
import { notifyWeeklyFindings } from "../lib/weekly-alerts";
import type { AuditReport } from "../lib/audit-pipeline";
import type { findCompetitor404Opportunities } from "../lib/hijacker";

const rule: SyncRule = { id: "link", source: "/old-page", destination: "https://example.com/new-page" };
test("five redirect formats generate usable platform rules", () => {
  assert.deepEqual(JSON.parse(exportSyncRules("vercel", [rule])), { redirects: [{ source: "/old-page", destination: rule.destination, permanent: true }] });
  assert.match(exportSyncRules("nextjs", [rule]), /export default \{[\s\S]*async redirects\(\)/);
  assert.equal(exportSyncRules("cloudflare", [rule]), `/old-page ${rule.destination} 301\n`);
  assert.equal(exportSyncRules("nginx", [rule]), `rewrite ^/old-page$ ${rule.destination} permanent;\n`);
  assert.equal(exportSyncRules("shopify", [rule]), 'Redirect from,Redirect to\n"/old-page","/new-page"\n');
  assert.throws(() => exportSyncRules("nginx", [{ ...rule, source: "/bad;return 200" }]), /Invalid/);
});

test("Shopify push sends the documented 301 payload and requires confirmation", async () => {
  const original = globalThis.fetch;
  let accepted = true;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://shop.myshopify.com/admin/api/2026-01/redirects.json");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)["X-Shopify-Access-Token"], "test-secret");
    assert.deepEqual(JSON.parse(String(init?.body)), { redirect: { path: "/old-page", target: "/new-page" } });
    return accepted ? Response.json({ redirect: { path: "/old-page", target: "/new-page" } }, { status: 201 }) : Response.json({ errors: "rejected" }, { status: 422 });
  };
  try {
    await pushShopifyRedirect("shop.myshopify.com", "test-secret", rule);
    accepted = false;
    await assert.rejects(pushShopifyRedirect("shop.myshopify.com", "test-secret", rule), /rejected/);
    await assert.rejects(pushShopifyRedirect("evil.example", "test-secret", rule), /Invalid/);
  } finally { globalThis.fetch = original; }
});

test("rescue and weekly alert payloads escape mentions and use provider-specific fields", async () => {
  const rescue = { kind: "rescue" as const, source: "chatgpt.com", brokenPath: "/old", targetPath: "/new" };
  const slack = alertPayload("slack", rescue);
  assert.match(String("text" in slack && slack.text), /ChatGPT visitor/);
  const discord = alertPayload("discord", { kind: "weekly", domain: "example.com", broken: ["/@everyone"], competitors: ["/competitor"] });
  assert.ok("content" in discord && typeof discord.content === "string" && !discord.content.includes("@everyone"));
  assert.deepEqual("allowed_mentions" in discord && discord.allowed_mentions, { parse: [] });
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => { assert.equal(String(input), "https://hooks.slack.com/services/TEAM/CHANNEL/abcdefghijk"); assert.ok(init?.signal); return new Response("ok"); };
  try {
    await sendWorkspaceWebhook("https://hooks.slack.com/services/TEAM/CHANNEL/abcdefghijk", rescue);
    await assert.rejects(sendWorkspaceWebhook("https://attacker.example/hook", rescue), /Invalid/);
  } finally { globalThis.fetch = original; }
});

test("weekly alerts include only newly discovered broken links and competitor targets", async () => {
  const original = globalThis.fetch;
  const oldEnv = process.env;
  process.env = { ...oldEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com", SUPABASE_SECRET_KEY: "test-secret" };
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/audits")) {
      assert.equal(url.searchParams.get("user_id"), "eq.owner");
      return Response.json({ id: "prior", broken_links: [{ cited_url: "https://example.com/old" }] });
    }
    if (url.pathname.endsWith("/citation_hijack_opportunities")) return Response.json([{ dead_competitor_url: "https://competitor.com/old", target_url: "https://competitor.com/old" }]);
    throw new Error("Unexpected database call");
  };
  let sent: unknown;
  const report: AuditReport = { domain: "example.com", buyerPrompt: "test", generatedText: "", groundingMetadata: null, extractedUrls: [], sitemapUrlCount: 0, warnings: [], status: "completed", findings: [
    { url: "https://example.com/old", httpStatus: 404, error: null, suggestedRedirect: null },
    { url: "https://example.com/new", httpStatus: 404, error: null, suggestedRedirect: null },
  ] };
  const detect = async () => ({ opportunities: [
    { opportunity_type: "competitor_direct_404", dead_competitor_url: "https://competitor.com/old", target_url: "https://competitor.com/old" },
    { opportunity_type: "competitor_direct_404", dead_competitor_url: "https://competitor.com/new", target_url: "https://competitor.com/new" },
  ] } as unknown as Awaited<ReturnType<typeof findCompetitor404Opportunities>>);
  try {
    await notifyWeeklyFindings("owner", "current", report, { detect: detect as typeof findCompetitor404Opportunities, notify: async (_domain, alert, userId) => { sent = { alert, userId }; } });
    assert.deepEqual(sent, { userId: "owner", alert: { kind: "weekly", domain: "example.com", broken: ["https://example.com/new"], competitors: ["https://competitor.com/new"] } });
  } finally { globalThis.fetch = original; process.env = oldEnv; }
});
