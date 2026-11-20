"use client";

import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { DEFAULT_DASHBOARD_NAV } from "@/components/dashboard-navigation";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardShell items={DEFAULT_DASHBOARD_NAV}>
    <main role="alert" className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col justify-center px-5 py-12 sm:px-8">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-danger">Workspace error</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">This view could not load.</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary">Your workspace data is unchanged. Try loading this view again, or return to the Command Center.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="cm-button-primary cm-focus-ring">Try again</button>
        <Link href="/dashboard" className="cm-button-secondary cm-focus-ring">Command Center</Link>
      </div>
    </main>
  </DashboardShell>;
}
