import { normalizeDashboardDomain } from "./audit-dashboard";

export function urlPathKeywords(value: string): string {
  const url = new URL(value);
  const text = decodeURIComponent(url.pathname).replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
  return text || "homepage";
}

/** Deterministic core-page priority, with no external domains or asset URLs. */
export function selectSitemapPages(domain: string, values: string[]): { url: string; page_title: string }[] {
  const hostname = normalizeDashboardDomain(domain);
  const pages = new Map<string, { url: string; page_title: string; priority: number }>();
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.hostname !== hostname || !["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || url.search || value.length > 2048) continue;
      if (/\.(?:xml|gz|pdf|png|jpe?g|gif|svg|webp|css|js|zip|mp4|woff2?)$/i.test(url.pathname) || /^\/(?:api|admin|login|sign-in|cart|checkout)(?:\/|$)/i.test(url.pathname)) continue;
      url.hash = "";
      const title = urlPathKeywords(url.href);
      if (title.length > 2000) continue;
      const depth = url.pathname.split("/").filter(Boolean).length;
      const core = /(?:^|\/)(?:pricing|plans|products?|features?|solutions?|platform|enterprise|integrations?|about|contact|use-cases)(?:\/|$)/i.test(url.pathname);
      const editorial = /^\/(?:blog|news|articles|changelog)(?:\/|$)/i.test(url.pathname);
      pages.set(url.href, { url: url.href, page_title: title, priority: (core ? 100 : 0) - (editorial ? 50 : 0) - depth });
    } catch { /* Invalid sitemap entries are not candidates. */ }
  }
  return [...pages.values()].sort((a, b) => b.priority - a.priority || a.url.localeCompare(b.url))
    .slice(0, 200).map(({ url, page_title }) => ({ url, page_title }));
}
