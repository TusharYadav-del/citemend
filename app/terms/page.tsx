import { LegalLayout } from "@/components/legal-layout"; import { getLegalDocument } from "@/lib/legal-documents";
export const metadata = { title: "Terms of Service | CiteMend", description: "Read the terms governing CiteMend accounts, recovery workflows, and subscriptions.", openGraph: { type: "website", title: "Terms of Service | CiteMend", description: "Terms for CiteMend accounts, recovery workflows, and subscriptions." } };
export default function Page(){const doc=getLegalDocument("terms")!;return <LegalLayout document={doc}/>;}
