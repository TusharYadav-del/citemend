import { auth } from "@clerk/nextjs/server";
import { getAuditCitationGaps } from "@/lib/citation-gap-store";
import type { CitationGap } from "@/lib/citation-gap";
import CitationGapPanel from "@/components/citation-gap-panel";
export default async function SavedCitationGaps({auditId,domain}:{auditId:string;domain:string}) {
  if (!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  let gap: CitationGap | undefined;
  try {
    const {userId}=await auth(); if (!userId) return null;
    gap=(await getAuditCitationGaps(userId,auditId)).get(auditId);
  } catch { return null; }
  return gap ? <CitationGapPanel domain={domain} gap={gap} /> : null;
}
