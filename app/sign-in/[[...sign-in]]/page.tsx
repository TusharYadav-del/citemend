import { SignIn } from "@clerk/nextjs";
import { connection } from "next/server";
import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | CiteMend",
  description: "Sign in to your CiteMend workspace.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ redirect_url?: string | string[] }>;

function safeRedirect(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path?.startsWith("/") && !path.startsWith("//") ? path : "/pricing";
}

async function SignInContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return <p role="alert" className="text-center text-foreground">Sign-in is temporarily unavailable. Please try again later.</p>;
  }
  const { redirect_url } = await searchParams;
  return <SignIn routing="path" path="/sign-in" forceRedirectUrl={safeRedirect(redirect_url)} />;
}

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return <main className="grid min-h-screen place-items-center bg-background px-5 py-12"><Suspense fallback={<p className="text-center text-foreground">Loading sign-in…</p>}><SignInContent searchParams={searchParams} /></Suspense></main>;
}
