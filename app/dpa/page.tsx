import { LegalLayout } from "@/components/legal-layout"; import { getLegalDocument } from "@/lib/legal-documents";
export const metadata = { title: "Data Processing Agreement | CiteMend" };
export default function Page(){const doc=getLegalDocument("dpa")!;return <LegalLayout document={doc}/>;}
