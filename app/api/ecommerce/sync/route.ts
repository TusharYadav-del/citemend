import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { compareProductClaims, mapBulkProductRedirects, parseProductFeed, parseShopifyProductSitemap, verifyProductUrl } from "@/lib/ecommerce-validator";
import { decryptShopifyAccessToken } from "@/lib/shopify";
import { readRequestJson } from "@/lib/read-request-json";
import { generateUrlEmbeddings, normalizeUrlEmbedding, urlEmbeddingModel } from "@/lib/gemini";
import { urlPathKeywords } from "@/lib/url-keywords";
import { publicFetch } from "@/lib/public-http";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  const { userId } = await auth(); if (!userId) return json({ error: "Sign in to view a catalog." }, 401);
  const domain = new URL(request.url).searchParams.get("domain")?.toLowerCase() ?? ""; const db = createServerDatabase();
  const owns = await db.from("audits").select("id").eq("user_id", userId).eq("domain", domain).limit(1); if (!owns.data?.length) return json({ error: "Workspace not found." }, 404);
  const result = await db.from("ecommerce_catalog_items").select("id,external_item_id,canonical_url,product_json,synced_at,platform").eq("user_id", userId).eq("workspace_domain", domain).order("synced_at", { ascending: false }).limit(1000);
  if(result.error)return json({error:"Catalog unavailable."},503);
  const visits=await db.from("rescued_ai_visits").select("rescued_target_url").eq("domain",domain).limit(10000);const counts=new Map<string,number>();for(const visit of visits.data??[])counts.set(visit.rescued_target_url,(counts.get(visit.rescued_target_url)??0)+1);
  const ownedAudits=await db.from("audits").select("id").eq("user_id",userId).eq("domain",domain).limit(1000);const auditIds=(ownedAudits.data??[]).map(row=>row.id);const observations=auditIds.length?await db.from("ai_observation_evidence").select("prompt_query,raw_answer").eq("domain",domain).in("audit_id",auditIds).order("observed_at",{ascending:false}).limit(500):{data:[],error:null};
  const items=(result.data??[]).map(item=>{const attributedAiVisits=item.canonical_url?counts.get(item.canonical_url)??0:0;const productName=String(item.product_json.title??item.product_json.name??"").toLowerCase();const sku=String(item.product_json.variant_sku??"").toLowerCase();const claims=(observations.data??[]).filter(row=>{const text=`${row.prompt_query} ${row.raw_answer}`.toLowerCase();return productName.length>2&&text.includes(productName)||sku.length>2&&text.includes(sku)}).map(row=>{const text=row.raw_answer.toLowerCase();const match=[...row.raw_answer.matchAll(/(?:[$€£]\s?)(\d+(?:,\d{3})*(?:\.\d{1,2})?)/g)].map(m=>Number(m[1].replace(/,/g,""))).find(Number.isFinite);const out=/\b(out of stock|discontinued|not available|sold out)\b/.test(text);const inStock=/\b(in stock|available now|currently available)\b/.test(text)&&!out;return {text:row.raw_answer,price:match??null,inStock:out?false:inStock?true:null}});
    const live={name:String(item.product_json.title??item.product_json.name??"Product"),url:item.canonical_url??"",price:typeof item.product_json.catalog_price==="number"?item.product_json.catalog_price:null,currency:typeof item.product_json.currency==="string"?item.product_json.currency:null,availability:item.product_json.catalog_in_stock===true?"instock":item.product_json.catalog_in_stock===false?"outofstock":null,sku:typeof item.product_json.variant_sku==="string"?item.product_json.variant_sku:null};const conflicts=compareProductClaims(live,claims);return {...item,price_mismatch:conflicts.some(c=>c.issues.includes("stale_price")),availability_mismatch:conflicts.some(c=>c.issues.some(i=>i.includes("stock"))),ai_claim_conflicts:conflicts,attributed_ai_visits:attributedAiVisits,estimated_recovered_revenue_usd:attributedAiVisits*15}});
  if(new URL(request.url).searchParams.get("action")==="redirects"){
    const broken=items.filter(item=>item.product_json.http_status===404&&item.canonical_url).slice(0,20);const lines=['"Redirect from","Redirect to"'];
    for(let offset=0;offset<broken.length;offset+=20){const batch=broken.slice(offset,offset+20);const vectors=await generateUrlEmbeddings(batch.map(item=>urlPathKeywords(item.canonical_url!)),"RETRIEVAL_QUERY",AbortSignal.timeout(15000));for(let index=0;index<batch.length;index++){const match=await db.rpc("match_sitemap_url",{query_embedding:JSON.stringify(normalizeUrlEmbedding(vectors[index])),target_domain:domain,match_threshold:0.75,match_count:10,query_model:urlEmbeddingModel()});if(match.error)continue;const verified=[];for(const candidate of match.data??[]){try{const u=new URL(candidate.url);if(u.hostname!==domain||u.pathname===new URL(batch[index].canonical_url!).pathname||!/^\/(products|collections)\//.test(u.pathname)||candidate.similarity<0.75)continue;const live=await verifyProductUrl(candidate.url);verified.push({url:live.finalUrl,similarity:candidate.similarity,status:live.status})}catch{/* malformed or blocked candidates are excluded */}}const mapping=mapBulkProductRedirects([batch[index].canonical_url!],verified)[0];if(mapping)lines.push(`"${mapping.source}","${mapping.target}"`);}}
    return new Response(lines.join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="shopify-301-${domain}.csv"`,"Cache-Control":"private, no-store"}});
  }
  return json({ items });
}
export async function POST(request: Request) {
  const { userId } = await auth(); if (!userId) return json({ error: "Sign in to sync a catalog." }, 401);
  const body = await readRequestJson(request, 1_000_000); if (body.kind !== "ok" || !body.value || typeof body.value !== "object") return json({ error: "Provide a valid catalog sync request." }, 400);
  const input = body.value as Record<string, unknown>; const domain = typeof input.domain === "string" ? input.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain)) return json({ error: "Provide a valid workspace domain." }, 400);
  const db = createServerDatabase(); const owns = await db.from("audits").select("id").eq("user_id", userId).eq("domain", domain).limit(1); if (!owns.data?.length) return json({ error: "Workspace not found." }, 404);
  let records: Record<string, unknown>[] = []; let platform = "feed";
  try {
    if (input.source === "shopify") {
      platform = "shopify"; const connections = await db.from("cms_connections").select("shop_subdomain,access_token").eq("user_id", userId).eq("domain", domain).eq("platform", "shopify").limit(1);
      const c = connections.data?.[0] as { shop_subdomain?: string; access_token?: string } | undefined; if (!c?.shop_subdomain || !c.access_token) return json({ error: "Connect Shopify before syncing." }, 409);
      const token=decryptShopifyAccessToken(c.access_token);let next:string|null=`https://${c.shop_subdomain}/admin/api/2026-01/products.json?limit=250`;
      for(let page=0;next&&page<20;page++){const response=await fetch(next,{headers:{"X-Shopify-Access-Token":token,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(12000)});if(!response.ok)return json({error:`Shopify catalog returned HTTP ${response.status}.`},502);const parsed=await response.json() as {products?:Record<string,unknown>[]};records.push(...(parsed.products??[]));const link=response.headers.get("link")??"";const match=/<([^>]+)>;\s*rel="next"/.exec(link);next=match?.[1]??null;if(records.length>5000)return json({error:"Catalog exceeds the 5,000 item sync limit."},413);if(next&&new URL(next).hostname!==c.shop_subdomain)return json({error:"Shopify returned an unexpected pagination host."},502);}
    } else if (input.source === "sitemap") { platform = "shopify_sitemap";let xml=typeof input.xml==="string"?input.xml:"";if(!xml){const response=await publicFetch(`https://${domain}/sitemap_products_1.xml`,{method:"GET",headers:{Range:"bytes=0-1048575"},signal:AbortSignal.timeout(10000)});if(!response.ok)return json({error:`Product sitemap returned HTTP ${response.status}.`},502);xml=(await response.text()).slice(0,1_048_576)}records=parseShopifyProductSitemap(xml).map(url=>({url})); }
    else if ((input.source === "csv" || input.source === "json") && typeof input.content === "string") records = parseProductFeed(input.content, input.source);
    else return json({ error: "Select Shopify, a product sitemap, or a CSV/JSON feed." }, 400);
    if (records.length > 5000) return json({ error: "Catalog exceeds the 5,000 item sync limit." }, 413);
    const rows = [];
    for (const product of records) {
      const variants = Array.isArray(product.variants) ? product.variants as Record<string, unknown>[] : [product];
      for (const variant of variants) {
        const rawValue = variant.url ?? variant.public_url ?? product.url;
        const defaultUrl = product.handle ? `https://${domain}/products/${String(product.handle)}${variant.id ? `?variant=${String(variant.id)}` : ""}` : "";
        const rawUrl = String(rawValue ?? defaultUrl);
        let validation: Awaited<ReturnType<typeof verifyProductUrl>> | null = null; try { validation = await verifyProductUrl(rawUrl); } catch { /* rejected SSRF or network error is retained as unknown */ }
        const id = String(variant.id ?? product.id ?? variant.sku ?? variant.sku_id ?? rawUrl).slice(0, 200);
        const price = Number(variant.price ?? product.price); const available = variant.available ?? product.available;
        rows.push({ user_id: userId, workspace_domain: domain, platform, external_item_id: id, canonical_url: validation?.finalUrl ?? (rawUrl || null), product_json: { ...product, variant_sku: variant.sku ?? null, catalog_price: Number.isFinite(price) ? price : null, catalog_in_stock: typeof available === "boolean" ? available : null, http_status: validation?.status ?? null, jsonld: validation?.facts ?? [], validation_error: validation ? null : "unverified" } });
      }
    }
    if(rows.length>5000)return json({error:"Catalog exceeds the 5,000 variant sync limit."},413);
    for (let offset = 0; offset < rows.length; offset += 100) { const saved = await db.from("ecommerce_catalog_items").upsert(rows.slice(offset, offset + 100), { onConflict: "user_id,workspace_domain,platform,external_item_id" }); if (saved.error) throw saved.error; }
    return json({ synced: rows.length, platform });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Catalog sync failed." }, 502); }
}
