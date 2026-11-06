import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { buildOptInBenchmark, predictCitationDecay } from "@/lib/predictive-decay";

export async function GET(request: Request) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) return Response.json({ error: "Sign in to view citation predictions." }, { status: 401 });
  const requestedDomain = new URL(request.url).searchParams.get("domain");
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, userId, orgId ?? null, orgRole ?? null);
    const auditsResult = await db.from("audits").select("id,domain").in("user_id", access.ownerUserIds).limit(1000);
    if (auditsResult.error) throw auditsResult.error;
    const audits = (auditsResult.data ?? []).filter((row) => !requestedDomain || row.domain === requestedDomain);
    if (requestedDomain && !audits.length) return Response.json({ error: "Workspace domain not found." }, { status: 404 });
    const auditIds = audits.map((row) => row.id);
    if (!auditIds.length) return Response.json({ predictions: [], sourceReplacementAlerts: [], benchmarks: [] });
    const [observationsResult, eventsResult] = await Promise.all([
      db.from("ai_observation_evidence").select("id,audit_id,domain,prompt_query,model_name,raw_answer,extracted_urls_json,sample_size,observed_at").in("audit_id", auditIds).order("observed_at", { ascending: true }).limit(2000),
      db.from("citation_change_events").select("id,prompt_query,event_type,source_url,replacement_url,new_replacement_url,replaced_by_competitor,evidence_json,detected_at").in("user_id", access.ownerUserIds).eq("workspace_domain", requestedDomain ?? audits[0].domain).in("event_type", ["source_replaced", "url_broke", "citation_gained", "citation_lost"]).order("detected_at", { ascending: false }).limit(100),
    ]);
    if (observationsResult.error || eventsResult.error) throw observationsResult.error ?? eventsResult.error;
    const observations = observationsResult.data ?? [];
    const grouped = new Map<string, typeof observations>();
    for (const item of observations) {
      const key = `${item.prompt_query}\u0000${item.model_name}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    const predictions = [...grouped.entries()].flatMap(([key, rows]) => {
      const prompt = key.split("\u0000")[0];
      const latest = rows.at(-1);
      if (!latest) return [];
      const citedNow = new Set(Array.isArray(latest.extracted_urls_json) ? latest.extracted_urls_json : []);
      return [...citedNow].filter((url): url is string => typeof url === "string").map((url) => ({
        prompt_query: prompt,
        model_name: latest.model_name,
        ...predictCitationDecay({ url, observations: rows.map((row) => ({ urls: Array.isArray(row.extracted_urls_json) ? row.extracted_urls_json : [], raw_answer: row.raw_answer, observed_at: row.observed_at, sample_size: row.sample_size })) }),
      }));
    }).sort((a, b) => b.decay_risk_score - a.decay_risk_score).slice(0, 100);

    const benchmarks: NonNullable<ReturnType<typeof buildOptInBenchmark>>[] = [];
    // Cross-workspace reads are used only for explicit opt-in aggregate statistics; no tenant keys or rows leave this route.
    const policies = await db.from("workspace_governance_policies").select("user_id,workspace_domain,benchmark_category").eq("allow_benchmark_aggregation", true).limit(1000);
    if (!policies.error) {
      const aggregates: { workspaceKey: string; cited: number; total: number; category: string }[] = [];
      for (const policy of policies.data ?? []) {
        const policyAudits = await db.from("audits").select("id").eq("user_id", policy.user_id).eq("domain", policy.workspace_domain).limit(1000);
        const ids = (policyAudits.data ?? []).map((item) => item.id);
        if (!ids.length) continue;
        const evidence = await db.from("ai_observation_evidence").select("extracted_urls_json").in("audit_id", ids).eq("domain", policy.workspace_domain).limit(2000);
        if (evidence.error || !evidence.data?.length) continue;
        aggregates.push({ workspaceKey: `${policy.user_id}\u0000${policy.workspace_domain}`, category: policy.benchmark_category, cited: evidence.data.filter((item) => Array.isArray(item.extracted_urls_json) && item.extracted_urls_json.some((url) => { try { return new URL(String(url)).hostname.toLowerCase() === policy.workspace_domain.toLowerCase(); } catch { return false; } })).length, total: evidence.data.length });
      }
      for (const category of new Set(aggregates.map((row) => row.category))) {
        const benchmark = buildOptInBenchmark(aggregates, category);
        if (benchmark) benchmarks.push(benchmark);
      }
    }
    return Response.json({ predictions, sourceReplacementAlerts: eventsResult.data ?? [], benchmarks }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Citation intelligence is temporarily unavailable." }, { status: 503 });
  }
}
