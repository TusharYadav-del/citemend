import "server-only";
import { createServerDatabase } from "./supabase-server";
import { parseCitationGap, type CitationGap } from "./citation-gap";

export async function saveAuditCitationGap(auditId: string, userId: string, domain: string, gap: CitationGap) {
  const db = createServerDatabase();
  const { data: owner, error: ownerError } = await db.from("audits").select("id").eq("id", auditId).eq("user_id", userId).single();
  if (ownerError || !owner) throw new Error("Citation evidence owner could not be verified.");
  const { error } = await db.from("audit_citation_gaps").upsert({ audit_id: auditId, user_id: userId, domain, buyer_prompt: gap.buyerPrompt, provider: gap.provider, competitor_urls: gap.competitorUrls }, { onConflict: "audit_id" });
  if (error) throw new Error("Citation evidence could not be saved.");
}
export async function getAuditCitationGaps(userId: string, auditId?: string): Promise<Map<string, CitationGap>> {
  if (!userId.trim()) return new Map();
  let query = createServerDatabase().from("audit_citation_gaps").select("audit_id,buyer_prompt,competitor_urls,provider").eq("user_id", userId);
  if (auditId) query = query.eq("audit_id", auditId);
  const { data, error } = await query;
  if (error) throw new Error("Citation evidence is temporarily unavailable.");
  const result = new Map<string, CitationGap>();
  for (const row of data ?? []) {
    const gap = parseCitationGap({ buyerPrompt: row.buyer_prompt, competitorUrls: row.competitor_urls, provider: row.provider });
    if (gap) result.set(row.audit_id, gap);
  }
  return result;
}
