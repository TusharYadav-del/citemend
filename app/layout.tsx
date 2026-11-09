import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Citemend | AI Citation Audit",
  description: "Find broken AI citations, verify your links, and recover traffic with suggested redirects.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://citemend.vercel.app"),
  openGraph: { type: "website", siteName: "CiteMend", title: "CiteMend | AI Citation Recovery", description: "Verify broken AI citations, review relevant replacements, and measure approved recovery." },
  twitter: { card: "summary_large_image", title: "CiteMend | AI Citation Recovery", description: "Verify broken AI citations and recover traffic with reviewed fixes." },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="flex min-h-full flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "CiteMend", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: process.env.NEXT_PUBLIC_APP_URL || "https://citemend.vercel.app", description: "Verify broken AI citations, review relevant replacements, and measure approved redirect recovery.", offers: [{ "@type": "Offer", price: "49", priceCurrency: "USD", name: "Starter monthly monitoring" }, { "@type": "Offer", price: "249", priceCurrency: "USD", name: "Agency monthly monitoring" }] }).replace(/</g, "\\u003c") }} />
        {clerkConfigured ? <ClerkProvider>{children}</ClerkProvider> : children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}

function Inter(_config: Record<string, unknown>) {
  return { variable: "font-inter-local" };
}

function JetBrains_Mono(_config: Record<string, unknown>) {
  return { variable: "font-mono-local" };
}
