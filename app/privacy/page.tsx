import { LegalLayout } from "@/components/legal-layout"; import { getLegalDocument } from "@/lib/legal-documents";
export const metadata = { title: "Privacy Policy | CiteMend", description: "Learn how CiteMend handles account, audit, and website evidence data.", openGraph: { type: "website", title: "Privacy Policy | CiteMend", description: "How CiteMend handles account, audit, and website evidence data." } };
export default function Page(){const doc=getLegalDocument("privacy")!;return <LegalLayout document={doc}/>;}
