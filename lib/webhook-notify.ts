import "server-only";

export type WebhookProvider = "slack" | "discord";
export type RecoveryAlert = { source: string; brokenPath: string; targetPath: string; confidence: number | null; test?: boolean };

export function webhookProvider(value: unknown): WebhookProvider | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
    if (url.hostname === "hooks.slack.com" && /^\/services\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{10,200}\/?$/.test(url.pathname)) return "slack";
    if (["discord.com", "discordapp.com"].includes(url.hostname)
        && /^\/api\/webhooks\/\d{16,22}\/[A-Za-z0-9._-]{20,200}\/?$/.test(url.pathname)) return "discord";
    return null;
  } catch {
    return null;
  }
}

export function isAlertableAIReferrer(value: string): boolean {
  const host = value.toLowerCase().replace(/\.$/, "");
  return ["chatgpt.com", "perplexity.ai", "claude.ai", "gemini.google.com", "copilot.microsoft.com", "you.com"]
    .some(domain => host === domain || host.endsWith(`.${domain}`));
}

function message(alert: RecoveryAlert, provider: WebhookProvider): string {
  const safe = (value: string) => value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\\/g, "\\\\").replace(/`/g, "\\`").slice(0, 500);
  const title = alert.test ? "CiteFix Webhook Test" : "CiteFix Rescued an AI Lead!";
  const confidence = Number.isFinite(alert.confidence) && alert.confidence !== null
    ? ` (${Math.round(Math.min(1, Math.max(0, alert.confidence)) * 100)}% vector match)` : "";
  const lines = [
    `🛟 ${provider === "slack" ? `*${title}*` : `**${title}**`}`,
    `• ${provider === "slack" ? "*Source:*" : "**Source:**"} \`${safe(alert.source)}\``,
    `• ${provider === "slack" ? "*Broken Hallucinated URL:*" : "**Broken Hallucinated URL:**"} \`${safe(alert.brokenPath)}\``,
    `• ${provider === "slack" ? "*Auto-Redirected To:*" : "**Auto-Redirected To:**"} \`${safe(alert.targetPath)}\`${confidence}`,
  ];
  return lines.join("\n");
}

export async function sendWebhookAlert(webhookUrl: string, alert: RecoveryAlert): Promise<WebhookProvider> {
  const provider = webhookProvider(webhookUrl);
  if (!provider) throw new Error("Unsupported Slack or Discord incoming webhook URL.");
  const content = message(alert, provider);
  const payload = provider === "slack" ? { text: content } : { content, allowed_mentions: { parse: [] } };
  const response = await fetch(webhookUrl, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error("The Slack or Discord webhook rejected the alert.");
  return provider;
}
