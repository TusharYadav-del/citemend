import { LegalLayout } from "@/components/legal-layout"; import { getLegalDocument } from "@/lib/legal-documents";
export const metadata = { title: "Refund & Cancellation Policy | CiteMend" };
export default function Page(){const doc=getLegalDocument("refund-policy")!;return <LegalLayout document={doc}/>;}
