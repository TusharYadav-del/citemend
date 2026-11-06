import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export const MCP_TOOLS = [
  { name: "citemend_get_workspace_health", description: "Read current workspace citation health and open 404 count.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "citemend_list_broken_citations", description: "List broken citations and available semantic suggestions.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "citemend_diagnose_citation_forensics", description: "Read recorded citation forensic findings for a prompt.", inputSchema: { type: "object", properties: { prompt: { type: "string", minLength: 1, maxLength: 1000 } }, required: ["prompt"], additionalProperties: false } },
  { name: "citemend_propose_redirect_for_approval", description: "Queue an existing verified recovery candidate for human approval; never deploys it.", inputSchema: { type: "object", properties: { brokenLinkId: { type: "string", format: "uuid" } }, required: ["brokenLinkId"], additionalProperties: false } },
];
export async function handleMcpTool(db: SupabaseClient, userId: string, domain: string, name: string, args: Record<string, unknown>) {
  if (name === "citemend_get_workspace_health") {
    const result = await db.from("audits").select("id,share_of_model_score,broken_links(http_status)").eq("user_id", userId).eq("domain", domain).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new Error("Workspace health is unavailable."); const links = (result.data?.broken_links ?? []) as Array<{http_status:number|null}>;
    return { citationHealthScore: result.data ? Math.max(0,100-links.filter(link=>link.http_status===404).length) : null, shareOfModel: result.data?.share_of_model_score ?? null, open404Count: links.filter(link=>link.http_status===404).length };
  }
  if (name === "citemend_list_broken_citations") {
    const result = await db.from("audits").select("id,broken_links(id,cited_url,http_status,suggested_redirect,match_confidence,approval_status)").eq("user_id",userId).eq("domain",domain).order("created_at",{ascending:false}).limit(20);
    if(result.error) throw new Error("Citation list is unavailable."); return (result.data??[]).flatMap(row=>(row.broken_links??[]).map(link=>({auditId:row.id,...link})));
  }
  if (name === "citemend_diagnose_citation_forensics") {
    const prompt=args.prompt; if(typeof prompt!=="string"||!prompt.trim()||prompt.length>1000) throw new Error("A prompt of at most 1,000 characters is required.");
    const audits=await db.from("audits").select("id").eq("user_id",userId).eq("domain",domain).limit(1000);if(audits.error)throw new Error("Workspace lookup is unavailable.");const ids=(audits.data??[]).map(row=>row.id);if(!ids.length)return {findings:[],categories:["discoverability","retrieval","citation_selection","stale_content","broken_destination"]};
    const result=await db.from("ai_observation_evidence").select("id,audit_id,prompt_query,raw_answer,extracted_urls_json,observed_at").in("audit_id",ids).eq("domain",domain).ilike("prompt_query",`%${prompt.replace(/[%,()]/g, " ")}%`).order("observed_at",{ascending:false}).limit(10);
    if(result.error) throw new Error("Forensic evidence is unavailable."); return { findings:result.data??[], categories:["discoverability","retrieval","citation_selection","stale_content","broken_destination"], note:"Only recorded evidence is returned; this endpoint does not claim access to private model reasoning." };
  }
  if (name === "citemend_propose_redirect_for_approval") {
    const id=args.brokenLinkId; if(typeof id!=="string") throw new Error("A broken link id is required.");
    const check=await db.from("broken_links").select("id,cited_url,suggested_redirect,http_status,approval_status,audit_id").eq("id",id).eq("http_status",404).maybeSingle();
    if(check.error||!check.data?.suggested_redirect||!["pending_review","needs_review"].includes(check.data.approval_status)) throw new Error("No eligible pending recovery candidate exists for this workspace.");
    const audit=await db.from("audits").select("id").eq("id",check.data.audit_id).eq("user_id",userId).eq("domain",domain).maybeSingle(); if(!audit.data) throw new Error("Candidate is outside this workspace.");
    const queued=await db.from("autonomous_agent_runs").insert({user_id:userId,workspace_domain:domain,audit_id:check.data.audit_id,broken_link_id:id,action_type:"vercel_301_export",risk_level:"high_risk_external_approval",current_step:"request_approval",run_status:"awaiting_approval",evidence_json:{source_url:check.data.cited_url,destination_url:check.data.suggested_redirect},recommendation_json:{message:"Human review is required before redirect approval or deployment."}}).select("id,run_status").single();
    if(queued.error||!queued.data)throw new Error("Approval queue is unavailable.");
    return { queued:true,approvalStatus:"pending_review",runId:queued.data.id,brokenLinkId:id,message:"Candidate queued for human review; no redirect was deployed." };
  }
  throw new Error("Unknown MCP tool.");
}
