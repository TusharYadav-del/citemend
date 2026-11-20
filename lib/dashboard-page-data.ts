import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { getUserAuditHistory } from "@/lib/audit-history";
import { getWorkspaceDomains } from "@/lib/workspace-domain-store";

export async function getDashboardPageData(requestedDomain?: string) {
  const session = await auth();
  if (!session.userId) redirect("/sign-in?redirect_url=%2Fdashboard");
  const db = createServerDatabase();
  const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
  const audits = await getUserAuditHistory(session.userId, access.ownerUserIds);
  const domains = await getWorkspaceDomains(db, access.ownerUserIds, audits.map(item => item.domain));
  const domain = requestedDomain && domains.includes(requestedDomain) ? requestedDomain : domains[0] ?? "";
  return { session, db, access, audits, domains, domain, ownerUserIds: access.ownerUserIds };
}
