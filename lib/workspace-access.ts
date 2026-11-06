import "server-only";
import type { createServerDatabase } from "@/lib/supabase-server";
import { resolveOrganizationRole, type WorkspaceRole } from "@/lib/rbac";

type Db = ReturnType<typeof createServerDatabase>;
const rank:Record<WorkspaceRole,number>={viewer:0,editor:1,admin:2,owner:3};
function leastPrivilege(a:WorkspaceRole,b:WorkspaceRole):WorkspaceRole{return rank[a]<=rank[b]?a:b;}

export type WorkspaceAccess={actorUserId:string;ownerUserIds:string[];organizationId:string|null;role:WorkspaceRole};
/** Resolve trusted Clerk org claims together with the server-side member record; mismatches use the lesser role. */
export async function resolveWorkspaceAccess(db:Db,userId:string,organizationId:string|null,claimRole:unknown):Promise<WorkspaceAccess>{
  if(!organizationId)return {actorUserId:userId,ownerUserIds:[userId],organizationId:null,role:resolveOrganizationRole(claimRole)??"owner"};
  const membership=await db.from("organization_members").select("owner_user_id,role").eq("organization_id",organizationId).eq("member_user_id",userId).maybeSingle();
  if(membership.error||!membership.data)throw new Error("Organization membership is required.");
  const stored=resolveOrganizationRole(membership.data.role)??"viewer";
  const claim=resolveOrganizationRole(claimRole);
  return {actorUserId:userId,ownerUserIds:[membership.data.owner_user_id],organizationId,role:claim?leastPrivilege(stored,claim):stored};
}
