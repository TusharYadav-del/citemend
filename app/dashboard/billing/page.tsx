import { getDashboardPageData } from "@/lib/dashboard-page-data";
import { BillingPanel } from "@/components/billing-panel";
import { billingReadiness } from "@/lib/billing-checkout";

export default async function BillingPage() {
  await getDashboardPageData();
  const readiness = billingReadiness();
  return <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Workspace / billing</p><h2 className="mt-1 text-2xl font-semibold">Plan &amp; Billing</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">Review your current plan and usage, start Dodo Payments checkout, or manage an existing subscription.</p><div className="mt-5"><BillingPanel checkoutReady={readiness.ready} checkoutMissing={readiness.missing} /></div></div>;
}
