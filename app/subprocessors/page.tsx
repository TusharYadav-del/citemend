import { LegalLayout } from "@/components/legal-layout";
import { getLegalDocument } from "@/lib/legal-documents";

export const metadata = { title: "Subprocessors | CiteMend" };

export default function SubprocessorsPage() {
  return <LegalLayout document={getLegalDocument("subprocessors")!} />;
}
