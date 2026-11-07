import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { canWorkspace } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session.userId) return Response.json({ error: "Sign in to view job progress." }, { status: 401 });
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    if (!canWorkspace(access.role, "read")) return Response.json({ error: "Workspace read permission is required." }, { status: 403 });
    const { data, error } = await db.from("background_jobs").select("id,workspace_domain,job_type,status,progress_percent,current_step_label,attempt_count,max_attempts,error_message,created_at,updated_at,completed_at")
      .in("user_id", access.ownerUserIds).order("updated_at", { ascending: false }).limit(25);
    if (error) throw error;
    return Response.json({ jobs: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Background job status is temporarily unavailable." }, { status: 503 }); }
}
