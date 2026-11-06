import { createServerDatabase } from "@/lib/supabase-server";
import { getWorkspaceOperatingMetrics } from "@/lib/operating-metrics";
import { OperatingMetricsPanel } from "@/components/operating-metrics-panel";

export async function WorkspaceOperatingMetrics({ domain, ownerUserIds, actorUserIds, organizationId }: { domain: string; ownerUserIds: string[]; actorUserIds: string[]; organizationId: string | null }) {
  let metrics = null;
  if (domain) {
    try {
      const db = createServerDatabase();
      let scopedActors = actorUserIds;
      if (organizationId) {
        const members = await db.from("organization_members").select("member_user_id").eq("organization_id", organizationId).eq("owner_user_id", ownerUserIds[0]).limit(1000);
        if (members.error) throw members.error;
        scopedActors = [...new Set([...actorUserIds, ...(members.data ?? []).map((row) => row.member_user_id)])];
      }
      metrics = (await getWorkspaceOperatingMetrics(db, ownerUserIds, domain, scopedActors)).workspaces.find((item) => item.domain === domain)?.metrics ?? null;
    }
    catch { /* Keep dashboard navigation available when telemetry is unavailable. */ }
  }
  return <OperatingMetricsPanel domain={domain} metrics={metrics} />;
}

export function OperatingMetricsSkeleton() {
  return <section aria-label="Loading operating metrics" aria-busy="true" className="mb-5 rounded-xl border border-white/10 bg-white/[.02] p-4"><div className="h-4 w-48 animate-pulse rounded bg-white/10" /><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-lg border border-white/5 bg-white/[.03]" />)}</div><span className="sr-only">Loading measured workspace and unit economics data...</span></section>;
}
