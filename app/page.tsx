import AuditDashboard from "@/components/audit-dashboard";

export default function Home() {
  return <AuditDashboard liveEnabled={process.env.NODE_ENV === "development"} />;
}
