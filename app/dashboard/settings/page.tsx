import { getDashboardPageData } from "@/lib/dashboard-page-data";
import WorkspaceApiKeys from "@/components/WorkspaceApiKeys";
import WorkspaceIntegrations from "@/components/workspace-integrations";
import WorkspaceGovernanceSettings from "@/components/WorkspaceGovernanceSettings";
import AgencyProfileSettings from "@/components/agency-profile-settings";
import { hasProSubscription } from "@/lib/subscription";
import { AgencyWorkspaceHub } from "@/components/agency-workspace-hub";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const params = await searchParams; const data = await getDashboardPageData(params.domain);
  const pro = await hasProSubscription(data.ownerUserIds[0]).catch(() => false);
  return <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Workspace / settings</p><h2 className="mt-1 text-2xl font-semibold">Workspace Settings</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">Manage workspace access, API keys, connected commerce services, and agency report branding.</p><div className="mt-5 grid gap-4"><AgencyWorkspaceHub audits={data.audits} selectedDomain={data.domain} /><section className="rounded-xl border border-border bg-surface p-5"><h3 className="font-semibold">Connected workspaces</h3><p className="mt-2 text-sm text-text-secondary">Active domain: {data.domain || "No domain selected"}</p><p className="mt-1 text-xs text-text-tertiary">Add and connect a domain by running the scanner. New audited domains are selectable immediately after the workspace refresh.</p></section>{data.domain && <WorkspaceGovernanceSettings domain={data.domain} />}{data.domain && <WorkspaceIntegrations key={data.domain} initialDomain={data.domain} domains={[data.domain]} />}{data.domain && <WorkspaceApiKeys key={data.domain} initialDomain={data.domain} domains={[data.domain]} />}{data.access.organizationId === null && data.domain && <AgencyProfileSettings key={data.domain} domains={[data.domain]} isPro={pro} />}</div></div>;
}
