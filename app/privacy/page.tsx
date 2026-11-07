import { LegalLayout } from "@/components/legal-layout"; import { getLegalDocument } from "@/lib/legal-documents";
export const metadata = { title: "Privacy Policy | CiteMend" };
export default function Page(){const doc=getLegalDocument("privacy")!;return <LegalLayout document={doc}/>;}
