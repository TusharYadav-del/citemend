import { LegalLayout } from "@/components/legal-layout"; import { getLegalDocument } from "@/lib/legal-documents";
export const metadata = { title: "Terms of Service | CiteMend" };
export default function Page(){const doc=getLegalDocument("terms")!;return <LegalLayout document={doc}/>;}
