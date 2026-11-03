export type SyncFormat = "vercel" | "nextjs" | "cloudflare" | "nginx" | "shopify";
export type SyncRule = { id: string; source: string; destination: string };

function csv(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function validRule(rule: SyncRule): boolean {
  if (!rule.source.startsWith("/") || rule.source.startsWith("//") || /[\s\\?#;$'"{}:*()[\]]/.test(rule.source)) return false;
  try { const url = new URL(rule.destination); return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash && !/\s/.test(url.href); } catch { return false; }
}

export function exportSyncRules(format: SyncFormat, rules: SyncRule[]): string {
  if (rules.some(rule => !validRule(rule))) throw new Error("Invalid redirect rule.");
  const redirects = rules.map(rule => ({ source: rule.source, destination: rule.destination, permanent: true }));
  if (format === "vercel") return JSON.stringify({ redirects }, null, 2) + "\n";
  if (format === "nextjs") return `export default {\n  async redirects() {\n    return ${JSON.stringify(redirects, null, 2).replaceAll("\n", "\n    ")};\n  },\n};\n`;
  if (format === "cloudflare") return rules.map(rule => `${rule.source} ${rule.destination} 301`).join("\n") + "\n";
  if (format === "nginx") return rules.map(rule => `rewrite ^${rule.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$ ${rule.destination.replace(/[$;{}\\]/g, char => encodeURIComponent(char))} permanent;`).join("\n") + "\n";
  return ["Redirect from,Redirect to", ...rules.map(rule => `${csv(rule.source)},${csv(new URL(rule.destination).pathname + new URL(rule.destination).search)}`)].join("\n") + "\n";
}

export async function pushShopifyRedirect(store: string, token: string, rule: SyncRule): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/.test(store) || !token || token.length > 4096 || /\s/.test(token) || !validRule(rule)) throw new Error("Invalid Shopify connection or redirect.");
  const target = new URL(rule.destination);
  const response = await fetch(`https://${store}/admin/api/2026-01/redirects.json`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ redirect: { path: rule.source, target: target.pathname + target.search } }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Shopify rejected the redirect (HTTP ${response.status}).`); }
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error("Shopify returned an invalid redirect result."); }
  const redirect = body && typeof body === "object" && "redirect" in body ? (body as { redirect?: unknown }).redirect : null;
  if (!redirect || typeof redirect !== "object" || (redirect as { path?: unknown }).path !== rule.source || (redirect as { target?: unknown }).target !== target.pathname + target.search) throw new Error("Shopify did not confirm the requested redirect.");
}
