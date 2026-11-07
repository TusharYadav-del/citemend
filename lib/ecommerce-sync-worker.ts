import "server-only";
import type { createServerDatabase } from "./supabase-server";
import { parseProductFeed, parseShopifyProductSitemap, verifyProductUrl } from "./ecommerce-validator";
import { decryptShopifyAccessToken } from "./shopify";
import { publicFetch } from "./public-http";
import type { BackgroundJobRow } from "./job-queue";

type Db = ReturnType<typeof createServerDatabase>;
type Product = Record<string, unknown>;
type ChunkResult = { done: boolean; payload: Record<string, unknown>; progress: number; label: string; result?: Record<string, unknown> };
const BATCH_SIZE = 10;

function variants(products: Product[]) {
  return products.flatMap(product => {
    const children = Array.isArray(product.variants) ? product.variants as Product[] : [product];
    return children.map(variant => ({ product, variant }));
  });
}

function catalogRow(userId: string, domain: string, platform: string, product: Product, variant: Product, validation: Awaited<ReturnType<typeof verifyProductUrl>> | null) {
  const rawValue = variant.url ?? variant.public_url ?? product.url;
  const defaultUrl = product.handle ? `https://${domain}/products/${String(product.handle)}${variant.id ? `?variant=${String(variant.id)}` : ""}` : "";
  const rawUrl = String(rawValue ?? defaultUrl);
  const id = String(variant.id ?? product.id ?? variant.sku ?? variant.sku_id ?? rawUrl).slice(0, 200);
  const price = Number(variant.price ?? product.price);
  const available = variant.available ?? product.available;
  return {
    user_id: userId, workspace_domain: domain, platform, external_item_id: id,
    canonical_url: validation?.finalUrl ?? (rawUrl || null),
    product_json: { ...product, variant_sku: variant.sku ?? null, catalog_price: Number.isFinite(price) ? price : null, catalog_in_stock: typeof available === "boolean" ? available : null, http_status: validation?.status ?? null, jsonld: validation?.facts ?? [], validation_error: validation ? null : "unverified" },
  };
}

async function fetchShopifyPage(db: Db, job: BackgroundJobRow, pageUrl: string) {
  const connection = await db.from("cms_connections").select("shop_subdomain,access_token").eq("user_id", job.user_id).eq("domain", job.workspace_domain).eq("platform", "shopify").limit(1);
  const saved = connection.data?.[0] as { shop_subdomain?: string; access_token?: string } | undefined;
  if (connection.error || !saved?.shop_subdomain || !saved.access_token) throw new Error("Shopify connection is unavailable for this workspace.");
  const host = saved.shop_subdomain.toLowerCase();
  let url: URL;
  try { url = new URL(pageUrl); } catch { throw new Error("Shopify pagination URL is invalid."); }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== host || !url.pathname.startsWith("/admin/api/2026-01/products.json")) throw new Error("Shopify pagination URL did not match the connected store.");
  const token = decryptShopifyAccessToken(saved.access_token);
  const response = await fetch(url, { headers: { "X-Shopify-Access-Token": token, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Shopify catalog returned HTTP ${response.status}.`);
  const parsed = await response.json() as { products?: Product[] };
  const records = parsed.products ?? [];
  if (!Array.isArray(records) || records.length > 250) throw new Error("Shopify returned an invalid product page.");
  const nextLink = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("link") ?? "")?.[1] ?? null;
  return { records, nextUrl: nextLink, host };
}

async function sourceRecords(db: Db, job: BackgroundJobRow, payload: Record<string, unknown>): Promise<{ records: Product[]; platform: string; nextUrl: string | null; pagesSeen: number; payload: Record<string, unknown> }> {
  const source = payload.source;
  if (source === "shopify") {
    let records = Array.isArray(payload.records) ? payload.records as Product[] : [];
    let nextUrl = typeof payload.nextUrl === "string" ? payload.nextUrl : null;
    let pageDone = payload.pageDone === true;
    let pagesSeen = Number(payload.pagesSeen) || 0;
    if (!records.length || pageDone) {
      if (!nextUrl) {
        if (pagesSeen > 0) return { records: [], platform: "shopify", nextUrl: null, pagesSeen, payload };
        const connection = await db.from("cms_connections").select("shop_subdomain").eq("user_id", job.user_id).eq("domain", job.workspace_domain).eq("platform", "shopify").limit(1);
        const shop = connection.data?.[0] as { shop_subdomain?: string } | undefined;
        if (connection.error || !shop?.shop_subdomain) throw new Error("Connect Shopify before syncing.");
        nextUrl = `https://${shop.shop_subdomain}/admin/api/2026-01/products.json?limit=250`;
      }
      const page = await fetchShopifyPage(db, job, nextUrl);
      if ((Number(payload.totalProducts) || 0) + page.records.length > 5000) throw new Error("Catalog exceeds the 5,000 item sync limit.");
      nextUrl = page.nextUrl;
      pagesSeen++;
      records = page.records;
      if (Buffer.byteLength(JSON.stringify(records), "utf8") > 4_000_000) throw new Error("Shopify product page exceeds the 4 MB worker chunk limit.");
      pageDone = false;
      return { records, platform: "shopify", nextUrl, pagesSeen, payload: { ...payload, records, nextUrl, pagesSeen, totalProducts: (Number(payload.totalProducts) || 0) + records.length, pageDone, variantOffset: 0 } };
    }
    return { records, platform: "shopify", nextUrl, pagesSeen, payload: { ...payload, records, nextUrl, pagesSeen, pageDone, variantOffset: Number(payload.variantOffset) || 0 } };
  }
  if (source === "sitemap") {
    let xml = typeof payload.xml === "string" ? payload.xml : "";
    if (!xml) {
      const response = await publicFetch(`https://${job.workspace_domain}/sitemap_products_1.xml`, { method: "GET", headers: { Range: "bytes=0-1048575" }, signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error(`Product sitemap returned HTTP ${response.status}.`);
      xml = (await response.text()).slice(0, 1_048_576);
    }
    const urls = parseShopifyProductSitemap(xml);
    if (urls.length > 5000) throw new Error("Catalog exceeds the 5,000 item sync limit.");
    const records = urls.map(url => ({ url }));
    return { records, platform: "shopify_sitemap", nextUrl: null, pagesSeen: 1, payload: { ...payload, records, variantOffset: Number(payload.variantOffset) || 0 } };
  }
  if ((source === "csv" || source === "json") && typeof payload.content === "string") {
    const records = parseProductFeed(payload.content, source).slice(0, 5001) as Product[];
    if (records.length > 5000) throw new Error("Catalog exceeds the 5,000 item sync limit.");
    return { records, platform: "feed", nextUrl: null, pagesSeen: 1, payload: { ...payload, records, variantOffset: Number(payload.variantOffset) || 0 } };
  }
  throw new Error("The saved catalog sync request is invalid.");
}

export async function processEcommerceSyncChunk(db: Db, job: BackgroundJobRow): Promise<ChunkResult> {
  const payload = job.payload_json;
  const source = await sourceRecords(db, job, payload);
  const flat = variants(source.records);
  if ((Number(source.payload.synced) || 0) + flat.length > 5000) throw new Error("Catalog exceeds the 5,000 variant sync limit.");
  const offset = Number(source.payload.variantOffset) || 0;
  if (!flat.length && source.nextUrl === null) return { done: true, payload: source.payload, progress: 100, label: "Catalog synchronized", result: { synced: Number(payload.synced) || 0, platform: source.platform } };
  if (offset >= flat.length) {
    if (source.platform === "shopify" && source.nextUrl) {
      return { done: false, payload: { ...source.payload, records: [], pageDone: true, variantOffset: 0 }, progress: Math.min(90, job.progress_percent + 2), label: `Shopify page ${source.pagesSeen} validated; loading next page` };
    }
    return { done: true, payload: source.payload, progress: 100, label: "Catalog synchronized", result: { synced: Number(source.payload.synced) || 0, platform: source.platform } };
  }
  const batch = flat.slice(offset, offset + BATCH_SIZE);
  const checked = await Promise.all(batch.map(async ({ product, variant }) => {
    const rawValue = variant.url ?? variant.public_url ?? product.url;
    const defaultUrl = product.handle ? `https://${job.workspace_domain}/products/${String(product.handle)}${variant.id ? `?variant=${String(variant.id)}` : ""}` : "";
    const url = String(rawValue ?? defaultUrl);
    let result: Awaited<ReturnType<typeof verifyProductUrl>> | null = null;
    try { result = await verifyProductUrl(url); } catch { /* Invalid and blocked targets stay unverified. */ }
    return catalogRow(job.user_id, job.workspace_domain, source.platform, product, variant, result);
  }));
  for (let batchOffset = 0; batchOffset < checked.length; batchOffset += 100) {
    const { error } = await db.from("ecommerce_catalog_items").upsert(checked.slice(batchOffset, batchOffset + 100), { onConflict: "user_id,workspace_domain,platform,external_item_id" });
    if (error) throw new Error("Catalog item batch could not be saved.");
  }
  const synced = (Number(source.payload.synced) || 0) + checked.length;
  const nextOffset = offset + checked.length;
  const hasNextPage = source.platform === "shopify" && source.nextUrl !== null;
  const currentDone = nextOffset >= flat.length;
  const done = currentDone && !hasNextPage;
  const nextPayload = { ...source.payload, variantOffset: nextOffset, synced, ...(currentDone && hasNextPage ? { records: [], pageDone: true, variantOffset: 0 } : {}) };
  const progress = done ? 100 : Math.min(95, Math.max(job.progress_percent + 1, Math.round(synced / Math.max(1, synced + flat.length - nextOffset + (hasNextPage ? 250 : 0)) * 90)));
  return {
    done, payload: nextPayload, progress,
    label: done ? "Catalog synchronized" : `Validated ${synced} product variants`,
    ...(done ? { result: { synced, platform: source.platform } } : {}),
  };
}
