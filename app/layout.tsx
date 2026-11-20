import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { MotionProvider } from "@/components/motion-provider";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const uiFont = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const codeFont = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code", display: "swap" });


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
    <html lang="en" className={`h-full antialiased ${uiFont.variable} ${codeFont.variable}`}>
      <body className="flex min-h-full flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "CiteMend", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: process.env.NEXT_PUBLIC_APP_URL || "https://citemend.vercel.app", description: "Commerce Reliability & Revenue Infrastructure for accurate, accessible, and measurable interactions across Search, AI Assistants, and Autonomous Agents.", offers: [{ "@type": "Offer", price: "149", priceCurrency: "USD", name: "Pilot (30-day one-time)" }, { "@type": "Offer", price: "99", priceCurrency: "USD", name: "Growth (monthly)" }, { "@type": "Offer", price: "249", priceCurrency: "USD", name: "Agency (monthly)" }] }).replace(/</g, "\\u003c") }} />
        <MotionProvider>{clerkConfigured ? <ClerkProvider>{children}</ClerkProvider> : children}</MotionProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}

