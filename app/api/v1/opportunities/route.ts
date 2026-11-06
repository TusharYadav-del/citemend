import { authenticatePublicApi } from "@/lib/public-api-auth";
export async function GET(request: Request) {
  const auth = await authenticatePublicApi(request, "recovery:read"); if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const audits=await auth.db.from("audits").select("id,broken_links(id,cited_url,http_status,url_state,suggested_redirect,approval_status)").eq("user_id",auth.userId).eq("domain",auth.domain).limit(1000);if(audits.error)return Response.json({error:"Workspace lookup unavailable."},{status:503});const ids=(audits.data??[]).map(row=>row.id);if(!ids.length)return Response.json({data:[],verifiedBrokenCitations:[]});
  const result = await auth.db.from("citation_hijack_opportunities").select("id,audit_id,opportunity_type,prompt_query,target_url,dead_competitor_url,http_status,matched_user_live_url,similarity_score,lifecycle_stage,composite_priority_score").eq("domain", auth.domain).in("audit_id",ids).order("composite_priority_score", { ascending: false }).limit(100);
  const verifiedBrokenCitations=(audits.data??[]).flatMap(audit=>(audit.broken_links??[]).filter(link=>link.http_status===404||link.http_status===410).map(link=>({auditId:audit.id,...link})));
  return result.error ? Response.json({ error: "Opportunity query unavailable." }, { status: 503 }) : Response.json({ data: result.data ?? [],verifiedBrokenCitations }, { headers: { "Cache-Control": "private, no-store" } });
}
