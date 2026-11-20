"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowUpRight } from "lucide-react";

export function SiteAuthActions() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <span aria-hidden="true" className="h-10 w-32 animate-pulse rounded-md bg-surface"/>;
  return <>{!isSignedIn && <Link href="/sign-in" className="hidden min-h-10 items-center rounded-md px-3 text-sm font-medium text-text-secondary transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent sm:inline-flex">Sign in</Link>}<Link href={isSignedIn ? "/dashboard" : "/pricing"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent sm:px-4"><span>{isSignedIn ? "Open Dashboard" : "Start $149 Pilot"}</span><ArrowUpRight className="size-4"/></Link></>;
}
