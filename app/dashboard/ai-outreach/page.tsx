import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { parseFounderAllowlist } from "@/lib/founder-os";
import AiOutreachDashboard from "@/components/ai-outreach-dashboard";
import { DashboardShell } from "@/components/dashboard-shell";
import { FOUNDER_DASHBOARD_NAV } from "@/components/dashboard-navigation";

export default async function AiOutreachPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  if (!parseFounderAllowlist().includes(userId)) redirect("/dashboard");
  return <DashboardShell items={FOUNDER_DASHBOARD_NAV}><div className="min-h-screen bg-background p-4 text-foreground sm:p-6 lg:p-8"><div className="mx-auto w-full max-w-6xl"><AiOutreachDashboard /></div></div></DashboardShell>;
}
