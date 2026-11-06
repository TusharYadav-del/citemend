import test from "node:test";
import assert from "node:assert/strict";
import { parseProductJsonLd, compareProductClaims, parseProductFeed, mapBulkProductRedirects } from "../lib/ecommerce-validator";
import { canWorkspace, resolveOrganizationRole } from "../lib/rbac";
import { handleMcpTool, MCP_TOOLS } from "../lib/mcp-server";

test("product schema parser reads Product and Offer fields",()=>{
  const facts=parseProductJsonLd(`<script type="application/ld+json">{"@type":"Product","name":"Trail Shoe","sku":"SH-1","offers":{"@type":"Offer","price":"79.99","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script>`,"https://shop.test/products/shoe");
  assert.deepEqual(facts[0],{name:"Trail Shoe",url:"https://shop.test/products/shoe",price:79.99,currency:"USD",availability:"instock",sku:"SH-1"});
});
test("product validator detects stale price, false stock claim, and missing offers",()=>{
  const live={name:"Boot",url:"https://shop.test/boot",price:45,currency:"USD",availability:"instock",sku:"B-1"};
  assert.deepEqual(compareProductClaims(live,[{text:"Boot costs 55 and is out of stock",price:55,inStock:false}]),[{claim:"Boot costs 55 and is out of stock",issues:["stale_price","false_out_of_stock"]}]);
  assert.deepEqual(compareProductClaims({...live,price:null,availability:null},[{text:"Boot available",price:null,inStock:null}])[0].issues,["missing_offer_schema"]);
});
test("product feeds parse CSV and JSON shapes",()=>{
  assert.deepEqual(parseProductFeed('sku,url\nA-1,https://shop.test/a',"csv"),[{sku:"A-1",url:"https://shop.test/a"}]);
  assert.deepEqual(parseProductFeed('{"products":[{"sku":"A-1"}]}',"json"),[{sku:"A-1"}]);
});
test("bulk SKU mapping exports only active same-store product or collection destinations",()=>{
  assert.deepEqual(mapBulkProductRedirects(["https://shop.test/products/old?variant=1"],[{url:"https://shop.test/products/new",similarity:0.91,status:200},{url:"https://attacker.test/products/new",similarity:0.99,status:200},{url:"https://shop.test/products/dead",similarity:0.98,status:404},{url:"https://shop.test/pages/about",similarity:0.97,status:200}]),[{source:"/products/old?variant=1",target:"/products/new",similarity:0.91}]);
});
test("workspace roles use least privilege and Clerk role claims map",()=>{
  assert.equal(canWorkspace("viewer","approve_redirect"),false);assert.equal(canWorkspace("editor","delete_workspace"),false);assert.equal(canWorkspace("editor","propose_redirect"),true);assert.equal(canWorkspace("owner","delete_workspace"),true);assert.equal(resolveOrganizationRole("org:admin"),"admin");assert.equal(resolveOrganizationRole("unknown"),null);
});
test("MCP exposes exactly the four read safe and gated tools",()=>{
  assert.deepEqual(MCP_TOOLS.map(tool=>tool.name),["citemend_get_workspace_health","citemend_list_broken_citations","citemend_diagnose_citation_forensics","citemend_propose_redirect_for_approval"]);
  assert.match(MCP_TOOLS[3].description,/human approval/i);
});
test("each MCP handler returns scoped data and proposal remains approval gated",async()=>{
  const rows:Record<string,unknown>={
    audits:{data:{id:"audit-1",share_of_model_score:42,broken_links:[{id:"link-1",cited_url:"https://shop.test/old",http_status:404,suggested_redirect:"https://shop.test/new",match_confidence:90,approval_status:"pending_review",audit_id:"audit-1"}]},error:null},
    ai_observation_evidence:{data:[{id:"obs-1",audit_id:"audit-1",prompt_query:"best shoe",raw_answer:"The shoe is in stock",extracted_urls_json:[],observed_at:"2026-01-01"}],error:null},
    broken_links:{data:{id:"link-1",cited_url:"https://shop.test/old",suggested_redirect:"https://shop.test/new",http_status:404,approval_status:"pending_review",audit_id:"audit-1"},error:null},
    autonomous_agent_runs:{data:{id:"run-1",run_status:"awaiting_approval"},error:null},
  };
  const makeDb=()=>({from(table:string){let inserted:unknown;const query={select(){return query},eq(){return query},in(){return query},order(){return query},limit(){return query},ilike(){return query},insert(value:unknown){inserted=value;return query},maybeSingle(){return Promise.resolve(rows[table])},single(){assert.equal((inserted as Record<string,unknown>).run_status,"awaiting_approval");return Promise.resolve(rows[table])},then(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown){const result=rows[table] as {data:unknown;error:null};return Promise.resolve(table==="audits"?{...result,data:[result.data]}:result).then(resolve,reject)}};return query}}) as never;
  assert.deepEqual(await handleMcpTool(makeDb(),"user-1","shop.test","citemend_get_workspace_health",{}),{citationHealthScore:99,shareOfModel:42,open404Count:1});
  assert.equal((await handleMcpTool(makeDb(),"user-1","shop.test","citemend_list_broken_citations",{}) as unknown[]).length,1);
  assert.equal((await handleMcpTool(makeDb(),"user-1","shop.test","citemend_diagnose_citation_forensics",{prompt:"best shoe"}) as {findings:unknown[]}).findings.length,1);
  const proposal=await handleMcpTool(makeDb(),"user-1","shop.test","citemend_propose_redirect_for_approval",{brokenLinkId:"link-1"}) as {queued:boolean;approvalStatus:string};assert.deepEqual(proposal,{queued:true,approvalStatus:"pending_review",runId:"run-1",brokenLinkId:"link-1",message:"Candidate queued for human review; no redirect was deployed."});
});
