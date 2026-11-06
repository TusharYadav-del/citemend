import { createRecoveryApproveHandler } from "@/lib/recovery-workflow";
import { auth } from "@clerk/nextjs/server";
import { canWorkspace, resolveOrganizationRole } from "@/lib/rbac";

const handle = createRecoveryApproveHandler();
export async function POST(request:Request){
  try{const session=await auth();if(session.orgRole){const payload=await request.clone().json().catch(()=>null) as {action?:unknown}|null;if(payload?.action==="approve"&&!canWorkspace(resolveOrganizationRole(session.orgRole)??"viewer","approve_redirect"))return Response.json({error:"Admin permission is required to approve redirects."},{status:403,headers:{"Cache-Control":"private, no-store"}})}}catch{return Response.json({error:"Authentication is temporarily unavailable."},{status:503})}
  return handle(request);
}
