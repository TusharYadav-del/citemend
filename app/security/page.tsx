import { LegalLayout } from "@/components/legal-layout";
import { getLegalDocument } from "@/lib/legal-documents";

export const metadata = { title: "Security Overview | CiteMend" };

export default function SecurityPage() {
  return <LegalLayout document={getLegalDocument("security")!} />;
}
