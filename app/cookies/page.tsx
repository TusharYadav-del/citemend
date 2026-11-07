import { LegalLayout } from "@/components/legal-layout"; import { getLegalDocument } from "@/lib/legal-documents";
export const metadata = { title: "Cookie & Pixel Policy | CiteMend" };
export default function Page(){const doc=getLegalDocument("cookies")!;return <LegalLayout document={doc}/>;}
