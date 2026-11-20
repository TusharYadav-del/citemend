import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";


export const metadata: Metadata = {
  title: "CiteMend | Commerce Reliability & Revenue Infrastructure",
  description: "Make every digital commerce interaction across Search, AI Assistants, and Autonomous Agents accurate, accessible, and measurable.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://citemend.vercel.app"),
  openGraph: { type: "website", siteName: "CiteMend", url: "/", title: "CiteMend | Commerce Reliability & Revenue Infrastructure", description: "Make every digital commerce interaction across Search, AI Assistants, and Autonomous Agents accurate, accessible, and measurable." },
  twitter: { card: "summary_large_image", title: "CiteMend | Commerce Reliability & Revenue Infrastructure", description: "Make digital commerce interactions across Search, AI Assistants, and Autonomous Agents accurate, accessible, and measurable." },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "CiteMend", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: process.env.NEXT_PUBLIC_APP_URL || "https://citemend.vercel.app", description: "Commerce Reliability & Revenue Infrastructure for accurate, accessible, and measurable interactions across Search, AI Assistants, and Autonomous Agents.", offers: [{ "@type": "Offer", price: "149", priceCurrency: "USD", name: "Pilot (30-day one-time)" }, { "@type": "Offer", price: "99", priceCurrency: "USD", name: "Growth (monthly)" }, { "@type": "Offer", price: "249", priceCurrency: "USD", name: "Agency (monthly)" }] }).replace(/</g, "\\u003c") }} />
        {clerkConfigured ? <ClerkProvider>{children}</ClerkProvider> : children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}

