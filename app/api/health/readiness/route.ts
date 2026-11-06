import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { auth } from "@clerk/nextjs/server";
import { canWorkspace } from "@/lib/rbac";
import { REQUIRED_READINESS_TABLES, runReadinessDoctor, type SchemaTableStatus } from "@/lib/readiness-doctor";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { createServerDatabase } from "@/lib/supabase-server";

const privateHeaders = { "Cache-Control": "private, no-store" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: privateHeaders });

async function inspectLiveDatabase(): Promise<{ connected: boolean; tables?: SchemaTableStatus[]; error?: string }> {
  let db: ReturnType<typeof createServerDatabase>;
  try { db = createServerDatabase(); }
  catch { return { connected: false, error: "Configure NEXT_PUBLIC_SUPABASE_URL and a server-side Supabase key." }; }

  const schema = await db.rpc("citemend_readiness_schema_status");
  if (!schema.error && schema.data) return { connected: true, tables: schema.data as SchemaTableStatus[] };

  const probe = await db.from("audits").select("id", { head: true, count: "exact" }).limit(0);
  if (probe.error) return { connected: false, error: "Supabase connectivity check failed; verify the URL and server key." };
  const results = await Promise.all(REQUIRED_READINESS_TABLES.map(async (table_name) => {
    // The fallback runs only before the readiness RPC migration is applied.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (db.from(table_name as any) as any).select("*", { head: true, count: "exact" }).limit(0);
    return { table_name, table_exists: !response.error || !/does not exist|could not find the table/i.test(response.error.message), rls_enabled: false, policy_count: 0 } satisfies SchemaTableStatus;
  }));
  return { connected: true, tables: results };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session.userId) return json({ error: "Sign in to run production readiness checks." }, 401);
  let role = "owner";
  if (session.orgId) {
    let db: ReturnType<typeof createServerDatabase>;
    try { db = createServerDatabase(); }
    catch { return json({ error: "A verified workspace membership is required." }, 503); }
    try {
      const access = await resolveWorkspaceAccess(db, session.userId, session.orgId, session.orgRole ?? null);
      role = access.role;
    } catch { return json({ error: "A verified workspace membership is required." }, 403); }
  }
  if (!canWorkspace(role, "manage_integrations")) return json({ error: "Production readiness is available to workspace admins and owners." }, 403);

  if (new URL(request.url).searchParams.get("format") === "sql") {
    try {
      const migration = await readFile(join(process.cwd(), "supabase", "migrations", "029_strict_rls_and_tenant_isolation.sql"), "utf8");
      return new Response(migration, { headers: { ...privateHeaders, "Content-Type": "application/sql; charset=utf-8", "Content-Disposition": "attachment; filename=029_strict_rls_and_tenant_isolation.sql" } });
    } catch { return json({ error: "The consolidated database setup script is unavailable." }, 503); }
  }

  const report = await runReadinessDoctor({ env: process.env, inspectDatabase: inspectLiveDatabase });
  return json(report);
}
