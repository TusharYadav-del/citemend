import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { readRequestJson } from "@/lib/read-request-json";
import { canWorkspace } from "@/lib/rbac";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";

const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});

async function workspace(request:Request,domainOverride?:string){
  const {userId,orgId,orgRole}=await auth();
  if(!userId)return {error:json({error:"Sign in required."},401)};
  const db=createServerDatabase();
  try{
    const access=await resolveWorkspaceAccess(db,userId,orgId??null,orgRole);
    if(!canWorkspace(access.role,"manage_integrations"))return {error:json({error:"Workspace administrator access is required."},403)};
    const domain=normalizeDashboardDomain(domainOverride??new URL(request.url).searchParams.get("domain")??"");
    const ownerId=access.ownerUserIds[0];
    const owned=await db.from("audits").select("id").eq("user_id",ownerId).eq("domain",domain).limit(1);
    if(owned.error)throw owned.error;
    if(!owned.data?.length)return {error:json({error:"Workspace not found."},404)};
    return {db,ownerId,domain};
  }catch{return {error:json({error:"Workspace not found."},404)}}
}

export async function GET(request:Request){
  const access=await workspace(request);if("error"in access)return access.error;
  const result=await access.db.from("scheduled_reports").select("id,report_type,schedule_at,recurrence_interval,status,payload_json").eq("user_id",access.ownerId).eq("workspace_domain",access.domain).order("schedule_at",{ascending:true}).limit(100);
  return result.error?json({error:"Schedules unavailable."},503):json({schedules:result.data??[]});
}

export async function POST(request:Request){
  const parsed=await readRequestJson(request,4096);
  if(parsed.kind!=="ok"||!parsed.value||typeof parsed.value!=="object")return json({error:"Provide schedule details."},400);
  const input=parsed.value as Record<string,unknown>;
  if(typeof input.domain!=="string")return json({error:"Provide a valid domain."},400);
  let domain:string;try{domain=normalizeDashboardDomain(input.domain)}catch{return json({error:"Provide a valid domain."},400)}
  const at=typeof input.scheduleAt==="string"?Date.parse(input.scheduleAt):NaN;
  const type=input.reportType??"weekly_summary";
  const recurrence=input.recurrenceInterval??"one_time";
  const email=typeof input.email==="string"?input.email.trim():"";
  if(!Number.isFinite(at)||at<Date.now()+60000||at>Date.now()+90*86400000||!("weekly_summary,reverification,citation_changes".split(",") as unknown[]).includes(type)||!("one_time,weekly,biweekly,monthly".split(",") as unknown[]).includes(recurrence)||!/^\S+@\S+\.\S+$/.test(email))return json({error:"Choose a report type, recurrence, valid recipient email, and a future schedule within 90 days."},400);
  const access=await workspace(request,domain);if("error"in access)return access.error;
  const saved=await access.db.from("scheduled_reports").insert({user_id:access.ownerId,workspace_domain:domain,report_type:type as "weekly_summary"|"reverification"|"citation_changes",schedule_at:new Date(at).toISOString(),recurrence_interval:recurrence as "one_time"|"weekly"|"biweekly"|"monthly",status:"scheduled",payload_json:{recipient:email}}).select("id,report_type,schedule_at,recurrence_interval,status").single();
  return saved.error?json({error:"Report schedule could not be saved."},503):json({schedule:saved.data},201);
}
