import "server-only";
import type { DiscoveryResult } from "./types";

const QUERIES = [
  ["US SEO agency AI search citations contact", "SEO agency", "US"], ["UK SEO agency AI search citations contact", "SEO agency", "UK"],
  ["US generative engine optimization GEO agency AI citations contact", "GEO agency", "US"], ["UK generative engine optimization GEO agency AI citations contact", "GEO agency", "UK"],
  ["US B2B SaaS AI search visibility citations company contact", "B2B SaaS", "US"], ["UK B2B SaaS AI search visibility citations company contact", "B2B SaaS", "UK"],
  ["US ecommerce brand AI search product citations contact", "ecommerce", "US"], ["UK ecommerce brand AI search product citations contact", "ecommerce", "UK"],
] as const;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
function parseDomain(value: string): string | null { try { const u = new URL(value); const host = u.hostname.toLowerCase().replace(/^www\./, ""); return host.includes(".") && !/\.(?:pdf|png|jpg|jpeg|svg|gov|edu)$/.test(host) ? host : null; } catch { return null; } }

/** Uses Tavily search-grounded public pages; only explicitly published emails are retained. */
export async function discoverProspects(limit = 20, fetcher: typeof fetch = fetch): Promise<DiscoveryResult[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return [];
  const found = new Map<string, DiscoveryResult>();
  for (const [query, category, country] of QUERIES) {
    if (found.size >= Math.min(20, Math.max(0, limit))) break;
    const response = await fetcher("https://api.tavily.com/search", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, search_depth: "basic", max_results: 8, include_answer: false }) });
    if (!response.ok) { await response.body?.cancel(); continue; }
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !Array.isArray((data as { results?: unknown }).results)) continue;
    for (const raw of (data as { results: unknown[] }).results) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>; const sourceUrl = typeof row.url === "string" ? row.url : ""; const domain = parseDomain(sourceUrl);
      if (!domain || /(^|\.)(google|bing|linkedin|facebook|instagram|youtube|tavily)\.com$/.test(domain)) continue;
      const excerpt = typeof row.content === "string" ? row.content.slice(0, 1600) : "";
      const title = typeof row.title === "string" ? row.title.slice(0, 180) : domain;
      const email = excerpt.match(emailPattern)?.[0]?.toLowerCase();
      const publicContact = email ? extractPublishedContact(excerpt, email, sourceUrl) : undefined;
      const existing = found.get(domain);
      found.set(domain, { domain, companyName: title.split(/[|–-]/)[0].trim() || domain, category, country, websiteUrl: `https://${domain}`, sourceUrl, excerpt, ...(publicContact && !existing?.contact ? { contact: publicContact } : existing?.contact ? { contact: existing.contact } : {}) });
      if (found.size >= Math.min(20, Math.max(0, limit))) break;
    }
  }
  return [...found.values()];
}

export function deduplicateProspects(items: DiscoveryResult[]): DiscoveryResult[] { return [...new Map(items.map(item => [item.domain.toLowerCase(), item])).values()]; }

function extractPublishedContact(excerpt: string, email: string, sourceUrl: string): NonNullable<DiscoveryResult["contact"]> {
  const emailAt = excerpt.toLowerCase().indexOf(email);
  const context = excerpt.slice(Math.max(0, emailAt - 100), Math.min(excerpt.length, emailAt + email.length + 100));
  const titleMatch = context.match(/\b(Founder|Co-Founder|CEO|Chief Executive Officer|CMO|VP of Marketing|Head of Marketing|Head of SEO|Director of SEO|Owner)\b/i);
  const nameMatch = context.match(/\b([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?)\b/);
  const name = nameMatch?.[1] && !/^(Public Contact|Email Address|Contact Details|Send Message)$/i.test(nameMatch[1]) ? nameMatch[1] : undefined;
  return { email, sourceUrl, ...(name ? { name } : {}), ...(titleMatch ? { title: titleMatch[1] } : {}) };
}
