import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { createServerDatabase } from "@/lib/supabase-server";
import { compareProductClaims, mapBulkProductRedirects, parseProductFeed, verifyProductUrl } from "@/lib/ecommerce-validator";
import { readRequestJson } from "@/lib/read-request-json";
import { generateUrlEmbeddings, normalizeUrlEmbedding, urlEmbeddingModel } from "@/lib/gemini";
import { urlPathKeywords } from "@/lib/url-keywords";
import { enqueueBackgroundJob, normalizeIdempotencyKey } from "@/lib/job-queue";

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
  try {
    if (input.source === "shopify") {
      const connection = await db.from("cms_connections").select("id").eq("user_id", userId).eq("domain", domain).eq("platform", "shopify").limit(1);
      if (connection.error) throw connection.error;
      if (!connection.data?.length) return json({ error: "Connect Shopify before syncing." }, 409);
    } else if (input.source === "sitemap") {
      if (typeof input.xml !== "undefined" && (typeof input.xml !== "string" || input.xml.length > 1_048_576)) return json({ error: "Product sitemap input must be text under 1 MiB." }, 413);
    } else if (input.source === "csv" || input.source === "json") {
      if (typeof input.content !== "string" || input.content.length > 1_000_000) return json({ error: "Provide a CSV/JSON feed up to 1 MB." }, 400);
      try { parseProductFeed(input.content, input.source); } catch { return json({ error: "The product feed could not be parsed." }, 400); }
    } else return json({ error: "Select Shopify, a product sitemap, or a CSV/JSON feed." }, 400);
    const key = normalizeIdempotencyKey(request.headers.get("idempotency-key"), randomUUID());
    const queued = await enqueueBackgroundJob(db, { userId, domain, type: "ecommerce_sync", key, payload: { source: input.source, ...(typeof input.content === "string" ? { content: input.content } : {}), ...(typeof input.xml === "string" ? { xml: input.xml } : {}) } });
    return json({ jobId: queued.id, status: queued.status, progressPercent: queued.progress_percent, currentStepLabel: queued.current_step_label }, 202);
  } catch (error) {
    if (error instanceof Error && /queue is full|rate limit reached/i.test(error.message)) return json({ error: error.message }, 429);
    return json({ error: error instanceof Error ? error.message : "Catalog sync failed." }, 502);
  }
}
