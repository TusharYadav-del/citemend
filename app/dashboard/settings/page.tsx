import { getDashboardPageData } from "@/lib/dashboard-page-data";
import WorkspaceApiKeys from "@/components/WorkspaceApiKeys";
import WorkspaceIntegrations from "@/components/workspace-integrations";
import WorkspaceGovernanceSettings from "@/components/WorkspaceGovernanceSettings";
import AgencyProfileSettings from "@/components/agency-profile-settings";
import { hasProSubscription } from "@/lib/subscription";
import { AgencyWorkspaceHub } from "@/components/agency-workspace-hub";
import { PageHeader } from "@/components/ui/page-header";
import { ConnectDomainForm } from "@/components/connect-domain-form";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const params = await searchParams;
  const data = await getDashboardPageData(params.domain);
  const pro = await hasProSubscription(data.ownerUserIds[0]).catch(() => false);
  return <div>
    <PageHeader eyebrow="Workspace administration" title="Settings & API" description="Manage domains, member access, keys, commerce connections, and agency branding." />
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="xl:col-span-2"><AgencyWorkspaceHub audits={data.audits} selectedDomain={data.domain} /></div>
      <section className="rounded-xl border border-border bg-surface-raised p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
        <h2 className="text-sm font-semibold">Connected domains</h2>
        <p className="mt-2 font-mono text-sm text-foreground">{data.domain || "No workspace selected"}</p>
        <p className="mt-2 text-xs leading-5 text-text-secondary">Workspaces save immediately and can be scanned later.</p>
        <div className="mt-4"><ConnectDomainForm initialDomain={data.domain} compact /></div>
      </section>
      {data.domain && <WorkspaceGovernanceSettings domain={data.domain} />}
      {data.domain && <WorkspaceIntegrations key={data.domain} initialDomain={data.domain} domains={data.domains} />}
      {data.domain && <WorkspaceApiKeys key={data.domain} initialDomain={data.domain} domains={data.domains} />}
      {data.access.organizationId === null && data.domain && <div className="xl:col-span-2"><AgencyProfileSettings key={data.domain} domains={data.domains} isPro={pro} /></div>}
    </div>
  </div>;
}
