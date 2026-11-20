import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create an account | CiteMend", description: "Create a CiteMend workspace account.", robots: { index: false, follow: false } };

async function SignUpContent() {
  await connection();
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return <p role="alert" className="text-center text-foreground">Account creation is temporarily unavailable. Please try again later.</p>;
  return <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" appearance={{ variables: { colorPrimary: "#10B981", colorBackground: "#101216", colorForeground: "#F5F6F7", colorMutedForeground: "#A1A8B3", colorInput: "#0B0D10", colorInputForeground: "#F5F6F7", borderRadius: "0.75rem" }, elements: { rootBox: "mx-auto w-full", cardBox: "border border-white/10 shadow-2xl", card: "shadow-none", headerTitle: "tracking-tight", formButtonPrimary: "font-semibold" } }} />;
}

export default function SignUpPage() {
  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-5 py-12"><div aria-hidden="true" className="cm-grid pointer-events-none absolute inset-0 opacity-30"/><div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_32px_100px_-60px_rgba(16,185,129,.3)]"><div className="border-b border-border px-5 py-4"><Link href="/" className="text-sm font-semibold tracking-tight text-foreground">CiteMend</Link><p className="mt-1 text-xs text-text-secondary">Create your workspace account</p></div><div className="px-3 py-5"><Suspense fallback={<p className="text-center text-foreground">Loading sign-up…</p>}><SignUpContent/></Suspense></div></div></main>;
}
