import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { createWorkspaceConnectHandler } from "@/lib/workspace-connect";

export const POST = createWorkspaceConnectHandler({
  authenticate: async () => {
    const session = await auth();
    if (!session.userId) return { userId: null, role: "viewer" as const };
    const access = await resolveWorkspaceAccess(createServerDatabase(), session.userId, session.orgId ?? null, session.orgRole ?? null);
    return { userId: session.userId, ownerUserId: access.ownerUserIds[0], role: access.role };
  },
  save: async (ownerUserId, domain) => {
    const { error } = await createServerDatabase().from("workspace_domains")
      .upsert({ owner_user_id: ownerUserId, domain }, { onConflict: "owner_user_id,domain" });
    if (error) throw new Error(error.message);
  },
});
