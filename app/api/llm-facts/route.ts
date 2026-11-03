import { createServerDatabase } from "@/lib/supabase-server";
import { getCanonicalPricing } from "@/lib/entity-truth";
import { checkUrlStatus } from "@/lib/seo";

const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const headers = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

function onDomain(value: string, domain: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && (url.hostname === domain || url.hostname === `www.${domain}`); } catch { return false; }
}

async function checkLimited(urls: string[]) {
  const result: { url: string; index: number; status: number | null }[] = new Array(urls.length);
  const signal = AbortSignal.timeout(15_000);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(5, urls.length) }, async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      result[index] = { url: urls[index], index, status: await checkUrlStatus(urls[index], signal).catch(() => null) };
    }
  }));
  return result;
}

export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain")?.trim().toLowerCase() ?? "";
  if (!domainPattern.test(domain)) return Response.json({ error: "Provide a valid domain query parameter." }, { status: 400, headers });
  try {
    const db = createServerDatabase();
    const { data: audit, error } = await db.from("audits").select("id,ground_truth_pricing,created_at").eq("domain", domain).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!audit) return Response.json({ error: "No audit facts are available for this domain." }, { status: 404, headers });
    const [pagesResult, redirectsResult] = await Promise.all([
      db.from("sitemap_pages").select("url,page_title").eq("domain", domain).order("updated_at", { ascending: false }).limit(200),
      db.from("broken_links").select("cited_url,suggested_redirect,http_status,audits!inner(domain)").eq("audits.domain", domain).in("http_status", [404, 410]).not("suggested_redirect", "is", null).limit(200),
    ]);
    if (pagesResult.error || redirectsResult.error) throw pagesResult.error ?? redirectsResult.error;
    let canonicalPricing: string | null = audit.ground_truth_pricing?.trim() || null;
    if (!canonicalPricing) {
      try { canonicalPricing = (await getCanonicalPricing(domain)).pricing; } catch { canonicalPricing = null; }
    }
    const candidates = [...new Set((pagesResult.data ?? []).map(row => row.url).filter(url => onDomain(url, domain)))].slice(0, 50);
    const liveUrls = (await checkLimited(candidates)).filter(item => item.status !== null && item.status >= 200 && item.status < 300).sort((a, b) => a.index - b.index).map(item => item.url);
    const deprecatedRedirects = (redirectsResult.data ?? []).flatMap(row => onDomain(row.cited_url, domain) && row.suggested_redirect && onDomain(row.suggested_redirect, domain)
      ? [{ from: row.cited_url, to: row.suggested_redirect, formerStatus: row.http_status }] : []).slice(0, 200);
    return Response.json({ domain, verifiedAt: audit.created_at, canonicalPricing, liveUrls, deprecatedRedirects }, { headers });
  } catch {
    return Response.json({ error: "The LLM facts feed is temporarily unavailable." }, { status: 503, headers });
  }
}
