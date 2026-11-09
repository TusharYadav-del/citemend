import { LegalLayout } from "@/components/legal-layout"; import { getLegalDocument } from "@/lib/legal-documents";
export const metadata = { title: "Refund & Cancellation Policy | CiteMend", description: "Review CiteMend subscription cancellation and refund terms.", openGraph: { type: "website", title: "Refund & Cancellation Policy | CiteMend", description: "CiteMend subscription cancellation and refund terms." } };
export default function Page(){const doc=getLegalDocument("refund-policy")!;return <LegalLayout document={doc}/>;}
