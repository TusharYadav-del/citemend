export default function DashboardLoading() {
  return <main className="min-h-screen bg-[#07090E] px-5 py-10 text-white sm:px-8 sm:py-14" role="status" aria-label="Loading command center"><div className="h-8 w-52 animate-pulse rounded-lg bg-white/10" /><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div><div className="mt-6 h-48 animate-pulse rounded-2xl bg-white/[0.04]" /><span className="sr-only">Loading your workspace dashboard…</span></main>;
}
