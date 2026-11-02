export type RedirectRuleInput = { source_path: string; target_url: string };
export type RedirectExportPlatform = "vercel" | "nextjs" | "cloudflare" | "wordpress" | "shopify";

type NormalizedRule = { sourcePath: string; targetUrl: string; targetPath: string };

function normalizeRules(rules: RedirectRuleInput[]): NormalizedRule[] {
  return rules.flatMap(({ source_path, target_url }) => {
    if (typeof source_path !== "string" || !source_path.startsWith("/") || source_path.startsWith("//") || /[\r\n]/.test(source_path)) return [];
    try {
      const target = new URL(target_url);
      if (target.protocol !== "https:" || target.username || target.password) return [];
      return [{ sourcePath: source_path, targetUrl: target.href, targetPath: target.pathname + target.search }];
    } catch { return []; }
  });
}

function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }

export function formatRedirects(platform: RedirectExportPlatform, rules: RedirectRuleInput[]): string {
  const redirects = normalizeRules(rules);
  if (platform === "vercel") return JSON.stringify({ redirects: redirects.map(({ sourcePath, targetUrl }) => ({ source: sourcePath, destination: targetUrl, permanent: true })) }, null, 2) + "\n";
  if (platform === "nextjs") return `async redirects() {\n  return ${JSON.stringify(redirects.map(({ sourcePath, targetUrl }) => ({ source: sourcePath, destination: targetUrl, permanent: true })), null, 2).replaceAll("\n", "\n  ")}\n}`;
  if (platform === "cloudflare") return redirects.map(({ sourcePath, targetUrl }) => `${sourcePath} ${targetUrl} 301`).join("\n");
  if (platform === "wordpress") return ["source,target,regex, type, , , ", ...redirects.map(({ sourcePath, targetPath }) => [sourcePath, targetPath, "0", "301", "", "", ""].map(csvCell).join(","))].join("\n");
  return ["Redirect from,Redirect to", ...redirects.map(({ sourcePath, targetPath }) => [sourcePath, targetPath].map(csvCell).join(","))].join("\n");
}

export function redirectExportFilename(platform: RedirectExportPlatform): string {
  return { vercel: "vercel.json", nextjs: "next.config.ts.txt", cloudflare: "_redirects", wordpress: "wordpress-redirection.csv", shopify: "shopify-redirects.csv" }[platform];
}
