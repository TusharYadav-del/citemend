import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { canWorkspace } from "@/lib/rbac";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session.userId) return json({ error: "Sign in to view job progress." }, 401);
  const { jobId } = await context.params;
  if (!UUID.test(jobId)) return json({ error: "Background job not found." }, 404);
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    if (!canWorkspace(access.role, "read")) return json({ error: "Workspace read permission is required." }, 403);
    const { data, error } = await db.from("background_jobs").select("id,user_id,workspace_domain,job_type,status,progress_percent,current_step_label,result_json,attempt_count,max_attempts,next_retry_at,error_message,created_at,updated_at,completed_at")
      .eq("id", jobId).in("user_id", access.ownerUserIds).maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Background job not found." }, 404);
    return json({ jobId: data.id, workspaceDomain: data.workspace_domain, jobType: data.job_type, status: data.status,
      progressPercent: data.progress_percent, currentStepLabel: data.current_step_label,
      attemptCount: data.attempt_count, maxAttempts: data.max_attempts, nextRetryAt: data.next_retry_at,
      error: data.error_message, result: data.result_json, createdAt: data.created_at, updatedAt: data.updated_at, completedAt: data.completed_at });
  } catch { return json({ error: "Background job status is temporarily unavailable." }, 503); }
}
