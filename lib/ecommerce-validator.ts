import "server-only";
import { XMLParser } from "fast-xml-parser";
import { publicFetch } from "@/lib/public-http";

export type ProductFacts = { name: string; url: string; price: number | null; currency: string | null; availability: string | null; sku: string | null };
export type AiProductClaim = { text: string; price?: number | null; inStock?: boolean | null };
export function mapBulkProductRedirects(sources: string[], candidates: Array<{ url: string; similarity: number; status: number }>) {
  const active=candidates.filter(candidate=>candidate.status===200&&candidate.similarity>=0.75&&candidate.similarity<=1);
  return sources.flatMap(source=>{try{const from=new URL(source);const target=active.filter(candidate=>{try{const to=new URL(candidate.url);return to.origin===from.origin&&to.pathname!==from.pathname&&(/^\/products\//.test(to.pathname)||/^\/collections\//.test(to.pathname))}catch{return false}}).sort((a,b)=>b.similarity-a.similarity)[0];return target?[{source:from.pathname+from.search,target:new URL(target.url).pathname+new URL(target.url).search,similarity:target.similarity}]:[]}catch{return[]}});
}
export function parseProductJsonLd(html: string, fallbackUrl: string): ProductFacts[] {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
  const facts: ProductFacts[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const o = value as Record<string, unknown>;
    if (o["@graph"]) visit(o["@graph"]);
    const types = Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]];
    if (types.includes("Product")) {
      const offers = Array.isArray(o.offers) ? o.offers : [o.offers];
      const offer = (offers.find(item => item && typeof item === "object") ?? {}) as Record<string, unknown>;
      const rawPrice = offer.price ?? (offer.priceSpecification as Record<string, unknown> | undefined)?.price;
      const parsedPrice = Number(rawPrice);
      facts.push({ name: typeof o.name === "string" ? o.name : "Product", url: typeof o.url === "string" ? o.url : fallbackUrl, price: Number.isFinite(parsedPrice) ? parsedPrice : null, currency: typeof offer.priceCurrency === "string" ? offer.priceCurrency : null, availability: typeof offer.availability === "string" ? offer.availability.split(/[\/#]/).pop()!.toLowerCase() : null, sku: typeof o.sku === "string" ? o.sku : typeof offer.sku === "string" ? offer.sku : null });
    }
    for (const [key, child] of Object.entries(o)) if (key !== "@graph") visit(child);
  };
  for (const match of scripts) { try { visit(JSON.parse(match[1])); } catch { /* malformed JSON-LD is ignored */ } }
  return facts;
}
export function compareProductClaims(live: ProductFacts, claims: AiProductClaim[]) {
  return claims.flatMap(claim => {
    const issues: string[] = [];
    if (claim.price != null && live.price != null && Math.abs(claim.price - live.price) > 0.01) issues.push("stale_price");
    if (claim.inStock === false && live.availability === "instock") issues.push("false_out_of_stock");
    if (claim.inStock === true && ["outofstock", "discontinued"].includes(live.availability ?? "")) issues.push("false_in_stock");
    if (live.price == null || !live.availability) issues.push("missing_offer_schema");
    return issues.length ? [{ claim: claim.text, issues }] : [];
  });
}
export async function verifyProductUrl(url: string) {
  let current = new URL(url); let response: Response | undefined;
  for (let i = 0; i < 4; i++) {
    response = await publicFetch(current, { method: "GET", headers: { Range: "bytes=0-262143" }, signal: AbortSignal.timeout(10000) });
    if (![301,302,303,307,308].includes(response.status)) break;
    const location = response.headers.get("location"); await response.body?.cancel();
    if (!location || i === 3) break; current = new URL(location, current);
  }
  const status = response?.status ?? 0;
  const html = status >= 200 && status < 300 ? (await response!.text()).slice(0, 262144) : "";
  return { status, finalUrl: current.toString(), facts: parseProductJsonLd(html, current.toString()) };
}
export function parseProductFeed(input: string, format: "json" | "csv") {
  if (format === "json") { const data = JSON.parse(input); const items = Array.isArray(data) ? data : data.products; if (!Array.isArray(items)) throw new Error("JSON feed must contain a products array."); return items; }
  const rows = input.split(/\r?\n/).filter(Boolean).map(line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(cell => cell.replace(/^"|"$/g, "").replace(/""/g, '"')));
  if (!rows.length) return []; const headers = rows.shift()!; return rows.map(row => Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ""])));
}
export function parseShopifyProductSitemap(xml: string) { const root = new XMLParser({ ignoreAttributes: false }).parse(xml); const urls = root.urlset?.url ?? []; return (Array.isArray(urls) ? urls : [urls]).map((row: { loc?: string }) => row.loc).filter((url: unknown): url is string => typeof url === "string"); }
