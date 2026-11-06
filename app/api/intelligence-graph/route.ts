import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { readRequestJson } from "@/lib/read-request-json";
import { buildIntelligenceGraph } from "@/lib/intelligence-graph";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";

export async function POST(request: Request) {
  const { userId, orgId, orgRole } = await auth(); if (!userId) return Response.json({ error: "Sign in to view workspace evidence." }, { status: 401 });
  const parsed = await readRequestJson(request, 4096); if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object") return Response.json({ error: "Provide an audit ID." }, { status: 400 });
  const auditId = (parsed.value as Record<string, unknown>).auditId; if (typeof auditId !== "string") return Response.json({ error: "Provide an audit ID." }, { status: 400 });
  try {
    const db = createServerDatabase(); const access=await resolveWorkspaceAccess(db,userId,orgId??null,orgRole); const audit = await db.from("audits").select("id,domain,buyer_prompt").eq("id", auditId).in("user_id", access.ownerUserIds).maybeSingle();
    if (audit.error) throw audit.error; if (!audit.data) return Response.json({ error: "Audit not found." }, { status: 404 });
    const [evidence, opportunities, actions, outcomes] = await Promise.all([
      db.from("ai_observation_evidence").select("id,domain,prompt_query,provider,model_name,extracted_urls_json,sample_size,observed_at").eq("audit_id", auditId).eq("domain", audit.data.domain).order("observed_at", { ascending: true }).limit(500),
      db.from("citation_hijack_opportunities").select("id,domain,opportunity_type,target_url,dead_competitor_url,prompt_query,stage_history_json,created_at").eq("audit_id", auditId).eq("domain", audit.data.domain).order("created_at", { ascending: true }).limit(500),
      db.from("action_audit_logs").select("id,workspace_domain,action_type,target_url,previous_state_json,new_state_json,created_at").eq("workspace_domain", audit.data.domain).in("actor_user_id", access.ownerUserIds).order("created_at", { ascending: true }).limit(500),
      db.from("recovery_outcomes").select("id,domain,canonical_destination_url,technical_deployment_verified_at,ai_citation_observed_at,evidence_id,created_at").eq("audit_id", auditId).eq("domain", audit.data.domain).order("created_at", { ascending: true }).limit(500),
    ]);
    const error = evidence.error ?? opportunities.error ?? actions.error ?? outcomes.error; if (error) throw error;
    return Response.json({ graph: buildIntelligenceGraph({ domain: audit.data.domain, prompt: audit.data.buyer_prompt, observations: evidence.data ?? [], opportunities: opportunities.data ?? [], actions: actions.data ?? [], outcomes: outcomes.data ?? [] }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Workspace intelligence timeline is temporarily unavailable." }, { status: 503 }); }
}
