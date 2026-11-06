import { createRecoveryRollbackHandler } from "@/lib/recovery-workflow";
import { auth } from "@clerk/nextjs/server";
import { canWorkspace, resolveOrganizationRole } from "@/lib/rbac";

const handle = createRecoveryRollbackHandler();
export async function POST(request:Request){try{const session=await auth();if(session.orgRole&&!canWorkspace(resolveOrganizationRole(session.orgRole)??"viewer","approve_redirect"))return Response.json({error:"Admin permission is required to roll back redirects."},{status:403,headers:{"Cache-Control":"private, no-store"}})}catch{return Response.json({error:"Authentication is temporarily unavailable."},{status:503})}return handle(request)}
