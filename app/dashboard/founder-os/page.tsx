import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { parseFounderAllowlist } from "@/lib/founder-os";
import { PageHeader } from "@/components/ui/page-header";
import { DashboardShell } from "@/components/dashboard-shell";
import { FOUNDER_DASHBOARD_NAV } from "@/components/dashboard-navigation";
import { FounderOsDashboard } from "@/components/founder-os-dashboard";

export default async function FounderOperatingSystemPage() {
  const session = await auth();
  if (!session.userId) redirect("/");
  if (!parseFounderAllowlist().includes(session.userId)) redirect("/dashboard");
  return <DashboardShell items={FOUNDER_DASHBOARD_NAV}><main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 sm:py-8"><div className="mx-auto w-full max-w-6xl"><PageHeader eyebrow="Founder only · weekly operating system" title="Founder Operating System" description="Track weekly execution, operating quality, estimated unit economics, and plan-priced revenue trajectory." /><FounderOsDashboard /></div></main></DashboardShell>;
}
