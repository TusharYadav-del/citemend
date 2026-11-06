import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { IntegrationDirectory } from "@/components/integration-directory";

export const metadata: Metadata = { title: "Integrations Directory | CiteMend", description: "Browse setup guides for CiteMend recovery, reporting, identity, and developer integrations." };

export default function IntegrationsPage() {
  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-xs text-muted-foreground"><Link href="/" className="hover:text-foreground">CiteMend</Link><span aria-hidden="true">/</span><span className="text-foreground">Integrations</span></nav>
      <PageHeader eyebrow="Connect your recovery workflow" title="Integrations directory" description="Browse current connection options and step-by-step setup guides. Availability labels distinguish configured product paths from manual setup workflows." actions={<Link href="/dashboard#workspaces" className={buttonVariants()}>Open workspace settings</Link>} />
      <IntegrationDirectory />
    </div>
  </main>;
}
