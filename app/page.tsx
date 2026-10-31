import AuditDashboard from "@/components/audit-dashboard";

export default function Home() {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  return <AuditDashboard liveEnabled={clerkConfigured} clerkConfigured={clerkConfigured} />;
}
