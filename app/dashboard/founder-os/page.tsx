import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { parseFounderAllowlist } from "@/lib/founder-os";
import { PageHeader } from "@/components/ui/page-header";
import { Sidebar } from "@/components/ui/sidebar";
import { FounderOsDashboard } from "@/components/founder-os-dashboard";

export default async function FounderOperatingSystemPage() {
  const session = await auth();
  if (!session.userId) redirect("/");
  if (!parseFounderAllowlist().includes(session.userId)) redirect("/dashboard");
  return <main className="min-h-screen bg-[#07090E] text-slate-100"><div className="mx-auto flex min-h-screen max-w-[1600px]"><Sidebar items={[{ label: "Command Center", href: "/dashboard" }, { label: "Founder OS", href: "/dashboard/founder-os", active: true }]} /><div className="min-w-0 flex-1 px-5 py-8 sm:px-8 sm:py-10"><PageHeader eyebrow="Founder only · weekly operating system" title="Founder Operating System" description="Track weekly execution, operating quality, estimated unit economics, and plan-priced revenue trajectory." /><FounderOsDashboard /></div></div></main>;
}
