import "server-only";
import { createServerDatabase } from "./supabase-server";
import { webhookProvider } from "./webhook-notify";

export type WorkspaceAlert =
  | { kind: "rescue"; source: string; brokenPath: string; targetPath: string }
  | { kind: "weekly"; domain: string; broken: string[]; competitors: string[] }
  | { kind: "test"; domain: string };

const safe = (value: string) => value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/[`@]/g, "").slice(0, 300);

export function alertPayload(provider: "slack" | "discord", alert: WorkspaceAlert) {
  let text: string;
  if (alert.kind === "rescue") {
    const source = /(^|\.)(chatgpt\.com|openai\.com)$/.test(alert.source) ? "ChatGPT" : /(^|\.)perplexity\.ai$/.test(alert.source) ? "Perplexity" : /(^|\.)claude\.ai$/.test(alert.source) ? "Claude" : /(^|\.)gemini\.google\.com$/.test(alert.source) ? "Gemini" : /(^|\.)copilot\.microsoft\.com$/.test(alert.source) ? "Copilot" : alert.source;
    text = `🛟 CiteMend rescued a ${safe(source)} visitor\n${safe(alert.brokenPath)} → ${safe(alert.targetPath)}`;
  }
  else if (alert.kind === "weekly") text = `🔎 CiteMend weekly scan: ${safe(alert.domain)}\n${alert.broken.length} new broken AI citations; ${alert.competitors.length} new competitor 404 targets.${[...alert.broken, ...alert.competitors].slice(0, 5).map(item => `\n• ${safe(item)}`).join("")}`;
  else text = `✅ CiteMend test alert for ${safe(alert.domain)}`;
  return provider === "slack" ? { text, unfurl_links: false, unfurl_media: false } : { content: text, allowed_mentions: { parse: [] as string[] } };
}

export async function sendWorkspaceWebhook(url: string, alert: WorkspaceAlert): Promise<void> {
  const provider = webhookProvider(url);
  if (!provider) throw new Error("Invalid webhook URL.");
  const response = await fetch(url, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(alertPayload(provider, alert)) });
  await response.body?.cancel();
  if (!response.ok) throw new Error("Webhook delivery failed.");
}

export async function notifyWorkspace(domain: string, alert: WorkspaceAlert, userId?: string): Promise<void> {
  let query = createServerDatabase().from("workspace_integrations").select("slack_webhook_url,discord_webhook_url").eq("domain", domain).limit(100);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  await Promise.allSettled((data ?? []).flatMap(row => [row.slack_webhook_url, row.discord_webhook_url]).filter((url): url is string => !!url).map(url => sendWorkspaceWebhook(url, alert)));
}
