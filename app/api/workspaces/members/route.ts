import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { canWorkspace, resolveOrganizationRole } from "@/lib/rbac";
import { readRequestJson } from "@/lib/read-request-json";

const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
  const session=await auth();if(!session.userId)return json({error:"Sign in required."},401);
  if(!session.orgId)return json({role:"owner",members:[]});
  const db=createServerDatabase();const rows=await db.from("organization_members").select("member_user_id,role,created_at").eq("organization_id",session.orgId).limit(500);
  if(rows.error)return json({error:"Membership list unavailable."},503);
  return json({role:resolveOrganizationRole(session.orgRole,rows.data?.find(row=>row.member_user_id===session.userId)?.role)??"viewer",members:rows.data??[]});
}
export async function POST(request:Request){
  const session=await auth();if(!session.userId||!session.orgId)return json({error:"An authenticated organization session is required."},401);
  const parsed=await readRequestJson(request,4096);if(parsed.kind!=="ok"||!parsed.value||typeof parsed.value!=="object")return json({error:"Provide a member user ID and role."},400);
  const input=parsed.value as Record<string,unknown>;const role=resolveOrganizationRole(session.orgRole);
  if(!canWorkspace(role??"viewer","invite_members"))return json({error:"Admin permission required."},403);
  if(typeof input.memberUserId!=="string"||!/^user_[A-Za-z0-9]{4,}$/.test(input.memberUserId)||!("admin,editor,viewer".split(",") as unknown[]).includes(input.role))return json({error:"Provide a valid Clerk user ID and role."},400);
  const db=createServerDatabase();const caller=await db.from("organization_members").select("owner_user_id").eq("organization_id",session.orgId).eq("member_user_id",session.userId).maybeSingle();
  if(!caller.data)return json({error:"Organization membership is required."},403);
  const saved=await db.from("organization_members").upsert({organization_id:session.orgId,owner_user_id:caller.data.owner_user_id,member_user_id:input.memberUserId,role:input.role as string},{onConflict:"organization_id,member_user_id"}).select("id,member_user_id,role").single();
  return saved.error?json({error:"Member role could not be saved."},503):json({member:saved.data},201);
}
