import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

type SearchParams = Promise<{ redirect_url?: string | string[] }>;

function safeRedirect(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path?.startsWith("/") && !path.startsWith("//") ? path : "/pricing";
}

async function SignInContent({ searchParams }: { searchParams: SearchParams }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return <p role="alert" className="text-center text-white">Sign-in is temporarily unavailable. Please try again later.</p>;
  }
  const { redirect_url } = await searchParams;
  return <SignIn routing="path" path="/sign-in" forceRedirectUrl={safeRedirect(redirect_url)} />;
}

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return <main className="grid min-h-screen place-items-center bg-[#05070b] px-5 py-12"><Suspense fallback={<p className="text-center text-white">Loading sign-in…</p>}><SignInContent searchParams={searchParams} /></Suspense></main>;
}
