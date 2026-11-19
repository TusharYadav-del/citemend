import { authenticatePublicApi } from "@/lib/public-api-auth";
import { failedDestinationKey } from "@/lib/link-health";
export async function GET(request: Request) {
  const auth = await authenticatePublicApi(request, "recovery:read"); if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const audits=await auth.db.from("audits").select("id,broken_links(id,cited_url,http_status,url_state,suggested_redirect,approval_status,link_health_json,wayback_snapshot_json)").eq("user_id",auth.userId).eq("domain",auth.domain).limit(1000);if(audits.error)return Response.json({error:"Workspace lookup unavailable."},{status:503});const ids=(audits.data??[]).map(row=>row.id);if(!ids.length)return Response.json({data:[],verifiedBrokenCitations:[],linkCounts:{pageLevelBrokenLinkCount:0,uniqueFailedDestinationCount:0}});
  const result = await auth.db.from("citation_hijack_opportunities").select("id,audit_id,opportunity_type,prompt_query,target_url,dead_competitor_url,http_status,matched_user_live_url,similarity_score,source_page_url,failed_destination_url_key,replacement_snippet,wayback_snapshot_json,lifecycle_stage,composite_priority_score").eq("domain", auth.domain).in("audit_id",ids).order("composite_priority_score", { ascending: false }).limit(1000);
  const verifiedBrokenCitations=(audits.data??[]).flatMap(audit=>(audit.broken_links??[]).filter(link=>link.http_status===404||link.http_status===410).map(link=>({auditId:audit.id,...link})));
  if (result.error) return Response.json({ error: "Opportunity query unavailable." }, { status: 503 });
  const data = result.data ?? [];
  const pageDestinationPairs = new Set(data.filter(row=>row.opportunity_type==="listicle_outbound_404"&&row.source_page_url&&row.dead_competitor_url).map(row=>`${failedDestinationKey(row.source_page_url!) ?? row.source_page_url}|${row.failed_destination_url_key ?? failedDestinationKey(row.dead_competitor_url!) ?? row.dead_competitor_url}`));
  const uniqueDestinations = new Set([
    ...verifiedBrokenCitations.map(row=>failedDestinationKey(row.cited_url)),
    ...data.filter(row=>row.http_status===404||row.http_status===410).map(row=>row.failed_destination_url_key ?? failedDestinationKey(row.dead_competitor_url ?? "")),
  ].filter((value): value is string=>!!value));
  return Response.json({ data, verifiedBrokenCitations, linkCounts:{ pageLevelBrokenLinkCount:pageDestinationPairs.size, uniqueFailedDestinationCount:uniqueDestinations.size } }, { headers: { "Cache-Control": "private, no-store" } });
}
