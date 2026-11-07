import { LegalLayout } from "@/components/legal-layout"; import { getLegalDocument } from "@/lib/legal-documents";
export const metadata = { title: "Acceptable Use Policy | CiteMend" };
export default function Page(){const doc=getLegalDocument("acceptable-use")!;return <LegalLayout document={doc}/>;}
