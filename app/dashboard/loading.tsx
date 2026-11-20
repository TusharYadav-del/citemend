import { DashboardShell } from "@/components/dashboard-shell";
import { DEFAULT_DASHBOARD_NAV } from "@/components/dashboard-navigation";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <DashboardShell items={DEFAULT_DASHBOARD_NAV}>
      <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-8" role="status" aria-label="Loading workspace">
        <header className="mb-7 border-b border-border pb-5 sm:mb-8 sm:pb-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-8 w-56 max-w-full" />
          <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        </header>
        <Skeleton className="mb-6 h-16 w-full rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-lg" />)}
        </div>
        <Skeleton className="mt-6 h-52 w-full rounded-xl" />
        <span className="sr-only" aria-live="polite">Loading your workspace…</span>
      </main>
    </DashboardShell>
  );
}
