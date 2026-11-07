import "server-only";
import { load } from "cheerio";
import { publicFetch, assertPublicUrl } from "./public-http";
import { tracePublicRedirects } from "./seo";

export type CorePageType = "homepage" | "pricing" | "product" | "docs";
export type PageEntity = { type: CorePageType; url: string; state: string; canonical: string | null; title: string; visibleText: string; prices: string[]; planNames: string[]; planPrices: Record<string, string[]>; featureClaims: string[]; jsonLd: string[]; updatedAt: string | null };
const pricePattern = /(?:\$|USD\s?)(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?(?:\s*\/\s*(?:month|mo|year|yr))?|(?:₹|INR\s?)[\d,]+(?:\s*\/\s*(?:month|mo|year))?/gi;
const CAP = 1_000_000;

export function extractPageEntity(type: CorePageType, url: string, html: string, state = "200"): PageEntity {
  const $ = load(html); $("script:not([type='application/ld+json']),style,nav,footer,header,noscript,svg,template,iframe,form,[hidden],[aria-hidden='true']").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const canonical = $("link[rel='canonical']").first().attr("href");
  const prices = [...new Set(text.match(pricePattern) ?? [])].slice(0, 40);
  const planNames = [...new Set($("h1,h2,h3,[class*='plan'],[class*='tier']").map((_, element) => $(element).text().replace(/\s+/g, " ").trim()).get().filter(value => value.length > 1 && value.length < 80))].slice(0, 50);
  const planPrices = Object.fromEntries(planNames.map(name => { const start = text.toLowerCase().indexOf(name.toLowerCase()); const nearby = start < 0 ? "" : text.slice(start, start + 180); return [name.toLowerCase(), [...new Set(nearby.match(pricePattern) ?? [])]]; }).filter(([, values]) => (values as string[]).length > 0));
  const featureClaims = $("h1,h2,h3,li,[itemprop='description']").map((_, element) => $(element).text().replace(/\s+/g, " ").trim()).get().filter(value => value.length > 15 && value.length < 300).slice(0, 100);
  const jsonLd = $("script[type='application/ld+json']").map((_, element) => $(element).text().slice(0, 10000)).get().slice(0, 10);
  const updatedAt = $("time[datetime],meta[property='article:modified_time'],meta[name='last-modified']").first().attr("datetime") ?? $("meta[property='article:modified_time'],meta[name='last-modified']").first().attr("content") ?? null;
  let safeCanonical: string | null = null;
  if (canonical) { try { const parsed = new URL(canonical, url); if (parsed.protocol === "https:") safeCanonical = parsed.href; } catch {} }
  return { type, url, state, canonical: safeCanonical, title: $("title").first().text().trim().slice(0, 200), visibleText: text.slice(0, 50_000), prices, planNames, planPrices, featureClaims, jsonLd, updatedAt };
}

export async function fetchCorePage(domain: string, type: CorePageType): Promise<PageEntity> {
  const origin = assertPublicUrl(domain.includes("://") ? domain : `https://${domain}`);
  const paths: Record<CorePageType, string[]> = { homepage: ["/"], pricing: ["/pricing"], product: ["/product", "/features"], docs: ["/docs", "/faq"] };
  for (const path of paths[type]) {
    const initial = new URL(path, origin);
    try {
      const trace = await tracePublicRedirects(initial.href);
      const final = new URL(trace.finalUrl);
      if (final.hostname !== origin.hostname || trace.status !== 200) continue;
      const response = await publicFetch(final, { method: "GET", cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000), headers: { Accept: "text/html" } });
      if (response.status !== 200 || !/text\/html/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); continue; }
      const reader = response.body?.getReader(); if (!reader) continue;
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > CAP) { await reader.cancel(); throw new Error("Page exceeds 1 MB."); } chunks.push(value); } } finally { reader.releaseLock(); }
      return extractPageEntity(type, final.href, Buffer.concat(chunks).toString("utf8"));
    } catch { /* Alternate product/docs page names are tried within the same verified host. */ }
  }
  return { type, url: new URL(paths[type][0], origin).href, state: "unknown", canonical: null, title: "", visibleText: "", prices: [], planNames: [], planPrices: {}, featureClaims: [], jsonLd: [], updatedAt: null };
}

/** Fetches the exact externally cited page through the same DNS-pinned public HTTP guard. */
export async function fetchCitedPage(value: string): Promise<PageEntity> {
  const empty = (url: string, state: string): PageEntity => ({ type: "homepage", url, state, canonical: null, title: "", visibleText: "", prices: [], planNames: [], planPrices: {}, featureClaims: [], jsonLd: [], updatedAt: null });
  try {
    const initial = assertPublicUrl(value);
    const trace = await tracePublicRedirects(initial.href);
    const finalUrl = assertPublicUrl(trace.finalUrl);
    if (trace.status !== 200) return empty(finalUrl.href, String(trace.status));
    const response = await publicFetch(finalUrl, { method: "GET", cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000), headers: { Accept: "text/html" } });
    if (response.status !== 200 || !/text\/html/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); return empty(finalUrl.href, String(response.status)); }
    const reader = response.body?.getReader();
    if (!reader) return empty(finalUrl.href, "unknown");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > CAP) { await reader.cancel(); return empty(finalUrl.href, "blocked"); }
        chunks.push(chunk);
      }
    } finally { reader.releaseLock(); }
    return extractPageEntity("homepage", finalUrl.href, Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const state = error instanceof DOMException && error.name === "TimeoutError" || /timeout|timed out/i.test(message) ? "timeout" : /private|localhost|non-public|unsafe|standard port/i.test(message) ? "blocked" : "unknown";
    return empty(value, state);
  }
}

export async function checkRobotsAllows(url: string): Promise<boolean | null> {
  try {
    const target = new URL(assertPublicUrl(url));
    const robots = new URL("/robots.txt", target.origin);
    const response = await publicFetch(robots, { method: "GET", cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(5000), headers: { Accept: "text/plain" } });
    if (response.status === 404) { await response.body?.cancel(); return true; }
    if (response.status !== 200) { await response.body?.cancel(); return null; }
    const reader = response.body?.getReader(); if (!reader) return null;
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 256_000) { await reader.cancel(); return null; } chunks.push(value); } } finally { reader.releaseLock(); }
    const text = Buffer.concat(chunks).toString("utf8");
    let selected: { path: string; allow: boolean }[] = []; let current: { path: string; allow: boolean }[] = []; let applies = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.split("#", 1)[0].trim(); const colon = line.indexOf(":"); if (colon < 0) continue;
      const key = line.slice(0, colon).trim().toLowerCase(); const value = line.slice(colon + 1).trim();
      if (key === "user-agent") { if (current.length && applies) selected = current; current = []; applies = value === "*" || /citemend|googlebot/i.test(value); }
      else if ((key === "allow" || key === "disallow") && applies && value) current.push({ path: value, allow: key === "allow" });
    }
    if (current.length && applies) selected = current;
    const path = `${target.pathname}${target.search}`;
    const matches = selected.filter(rule => path.startsWith(rule.path)).sort((a, b) => b.path.length - a.path.length);
    return matches[0]?.allow ?? true;
  } catch { return null; }
}

export function comparePageEntities(pages: PageEntity[], aiAnswer = "") {
  const conflicts: { kind: string; value: string; pages: string[]; evidence: string }[] = [];
  const pricePages = new Map<string, string[]>();
  for (const page of pages) for (const [plan, prices] of Object.entries(page.planPrices)) for (const price of prices) pricePages.set(`${plan}:${price}`, [...(pricePages.get(`${plan}:${price}`) ?? []), page.type]);
  const byPlan = new Map<string, Set<string>>();
  for (const key of pricePages.keys()) { const split = key.lastIndexOf(":"); const plan = key.slice(0, split); byPlan.set(plan, new Set([...(byPlan.get(plan) ?? []), key.slice(split + 1)])); }
  for (const [plan, values] of byPlan) if (values.size > 1) conflicts.push({ kind: "price_conflict", value: `${plan}: ${[...values].join(" vs ")}`, pages: [...new Set([...values].flatMap(price => pricePages.get(`${plan}:${price}`) ?? []))], evidence: "The same extracted plan heading has different visible price strings across fetched pages." });
  const canonicalPages = pages.filter(page => page.canonical);
  if (canonicalPages.some(page => new URL(page.canonical!).hostname !== new URL(pages[0].url).hostname)) conflicts.push({ kind: "canonical_mismatch", value: "Canonical host differs from audited host", pages: canonicalPages.map(page => page.type), evidence: "Canonical link hostname differs from the fetched audited hostname." });
  const stale = pages.filter(page => page.updatedAt && Date.now() - Date.parse(page.updatedAt) > 365 * 86400000);
  for (const page of stale) conflicts.push({ kind: "potentially_stale", value: page.updatedAt!, pages: [page.type], evidence: "Visible modified timestamp is older than one year; this is a freshness signal, not proof the claim is wrong." });
  const aiPriceMentions = [...new Set(aiAnswer.match(pricePattern) ?? [])];
  const visiblePrices = new Set(pages.flatMap(page => page.prices));
  for (const price of aiPriceMentions) if (visiblePrices.size && !visiblePrices.has(price)) conflicts.push({ kind: "ai_price_difference", value: price, pages: ["ai_observation"], evidence: "AI answer contains a price string not found among fetched page prices." });
  const structuredPrices = [...new Set(pages.flatMap(page => page.jsonLd.flatMap(raw => { try { const matches = raw.matchAll(/\"price\"\s*:\s*\"?([\d,.]+)/gi); return [...matches].map(match => match[1]); } catch { return []; } })))];
  const visibleAmounts = new Set([...visiblePrices].flatMap(value => value.match(/[\d,]+(?:\.\d{2})?/g) ?? []).map(value => value.replaceAll(",", "")));
  for (const price of structuredPrices) if (!visibleAmounts.has(price.replaceAll(",", ""))) conflicts.push({ kind: "structured_price_mismatch", value: price, pages: pages.filter(page => page.jsonLd.some(raw => raw.includes(price))).map(page => page.type), evidence: "A JSON-LD Offer price does not match any extracted visible page price." });
  const planNames = new Map<string, string[]>();
  for (const page of pages) for (const name of page.planNames) planNames.set(name.toLowerCase(), [...(planNames.get(name.toLowerCase()) ?? []), page.type]);
  const crossPageClaimDifferences = [...planNames].filter(([, types]) => new Set(types).size > 1).map(([name, types]) => ({ name, pages: [...new Set(types)] }));
  const answerText = aiAnswer.toLowerCase();
  const answerCrossChecks = pages.map(page => ({
    page: page.type,
    pagePricesMentionedInAnswer: page.prices.filter(value => answerText.includes(value.toLowerCase())),
    planNamesMentionedInAnswer: page.planNames.filter(value => answerText.includes(value.toLowerCase())),
    pagePlanNamesNotObservedInAnswer: page.planNames.filter(value => !answerText.includes(value.toLowerCase())),
    exactFeatureClaimsObservedInAnswer: page.featureClaims.filter(value => value.length < 180 && answerText.includes(value.toLowerCase())),
  }));
  const fixes = conflicts.map(conflict => ({ issue: conflict.kind, before: conflict.value, after: "Review the current canonical price/claim, then update HTML and JSON-LD consistently.", html: `<link rel="canonical" href="${pages[0]?.url ?? "https://example.com/"}">`, jsonLd: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", offers: [...pricePages.keys()].map(price => ({ "@type": "Offer", price, priceCurrency: price.includes("₹") ? "INR" : "USD" })) }) }));
  return { pages, conflicts, crossPageClaimDifferences, answerCrossChecks, fixes, guidance: "llms.txt and structured data are machine-readable conventions that improve clarity; they do not guarantee rankings or citations." };
}
