import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { getUserAuditHistory } from "@/lib/audit-history";
import { DashboardAppShell } from "@/components/dashboard-app-shell";
import { canWorkspace } from "@/lib/rbac";
import { getWorkspaceDomains } from "@/lib/workspace-domain-store";

async function DashboardWorkspaceShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session.userId) redirect("/sign-in?redirect_url=%2Fdashboard");
  let domains: string[] = [];
  let canScan = false;
  let canApprove = false;
  try {
    const access = await resolveWorkspaceAccess(createServerDatabase(), session.userId, session.orgId ?? null, session.orgRole ?? null);
    canScan = canWorkspace(access.role, "scan");
    canApprove = canWorkspace(access.role, "approve_redirect");
    const audits = await getUserAuditHistory(session.userId, access.ownerUserIds);
    domains = await getWorkspaceDomains(createServerDatabase(), access.ownerUserIds, audits.map(audit => audit.domain));
  } catch { /* Route pages render their own retry and empty states when workspace data is unavailable. */ }
  const jar = await cookies();
  const cookieDomain = decodeURIComponent(jar.get("citemend_active_domain")?.value ?? "");
  const initialDomain = domains.includes(cookieDomain) ? cookieDomain : domains[0] ?? "";
  return <DashboardAppShell domains={domains} initialDomain={initialDomain} canScan={canScan} canApprove={canApprove}>{children}</DashboardAppShell>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="min-h-screen bg-background" role="status" aria-live="polite"><p className="sr-only">Loading workspace…</p></div>}><DashboardWorkspaceShell>{children}</DashboardWorkspaceShell></Suspense>;
}
