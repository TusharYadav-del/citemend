import { getDashboardPageData } from "@/lib/dashboard-page-data";
import { BillingPanel } from "@/components/billing-panel";
import { billingReadiness } from "@/lib/billing-checkout";
import { PageHeader } from "@/components/ui/page-header";
import { BillingConfirmationBanner } from "@/components/billing-confirmation-banner";
import type { BillingTier } from "@/lib/billing-checkout";
import { canWorkspace } from "@/lib/rbac";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ domain?: string; billing?: string; checkout?: string }> }) {
  const params = await searchParams;
  const data = await getDashboardPageData(params.domain);
  const readiness = billingReadiness();
  const selectedTier = params.checkout === "pilot" || params.checkout === "growth" || params.checkout === "agency" ? params.checkout as BillingTier : undefined;
  const canManageBilling = canWorkspace(data.access.role, "manage_integrations");
  return <div className="space-y-4"><PageHeader eyebrow="Workspace / billing" title="Plan & Billing" description="Review your current plan and usage, start Dodo Payments checkout, or manage an existing subscription."/>{canManageBilling ? <><BillingConfirmationBanner active={params.billing === "success"} tier={selectedTier}/>{selectedTier && <p role="status" className="rounded-lg border border-accent/25 bg-accent/5 p-3 text-xs text-text-secondary">You selected the <strong className="text-foreground">{selectedTier === "pilot" ? "30-Day Recovery Pilot" : selectedTier === "growth" ? "Growth Store" : "Agency Multi-Workspace"}</strong>. Continue with that plan below when you are ready.</p>}<BillingPanel selectedTier={selectedTier} checkoutReady={readiness.ready} checkoutMissing={readiness.missing}/></> : <p role="status" className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-text-secondary">Billing details are available to workspace administrators.</p>}</div>;
}
