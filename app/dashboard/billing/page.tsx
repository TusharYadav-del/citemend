import { getDashboardPageData } from "@/lib/dashboard-page-data";
import { BillingPanel } from "@/components/billing-panel";
import { billingReadiness } from "@/lib/billing-checkout";
import { PageHeader } from "@/components/ui/page-header";

export default async function BillingPage() {
  await getDashboardPageData();
  const readiness = billingReadiness();
  return <div className="space-y-4"><PageHeader eyebrow="Workspace / billing" title="Plan & Billing" description="Review your current plan and usage, start Dodo Payments checkout, or manage an existing subscription."/><BillingPanel checkoutReady={readiness.ready} checkoutMissing={readiness.missing}/></div>;
}
