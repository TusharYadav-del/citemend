import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Citemend | AI Citation Audit",
  description: "Find broken AI citations, verify your links, and recover traffic with suggested redirects.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {clerkConfigured ? <ClerkProvider>{children}</ClerkProvider> : children}
      </body>
    </html>
  );
}