import "server-only";
import { createServerDatabase } from "./supabase-server";
import { findCompetitor404Opportunities } from "./hijacker";
import { notifyWorkspace } from "./alerts";
import type { AuditReport } from "./audit-pipeline";

/** Weekly scan runs after the cron response; delivery failure never fails the saved audit. */
export async function notifyWeeklyFindings(userId: string, auditId: string, report: AuditReport, overrides: { detect?: typeof findCompetitor404Opportunities; notify?: typeof notifyWorkspace } = {}): Promise<void> {
  const db = createServerDatabase();
  const previous = await db.from("audits").select("id,broken_links(cited_url)").eq("user_id", userId).eq("domain", report.domain).neq("id", auditId).in("status", ["completed", "partial"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previous.error) throw previous.error;
  const oldLinks = new Set((previous.data?.broken_links ?? []).map(link => link.cited_url));
  const broken = report.findings.filter(link => link.httpStatus === 404 && !oldLinks.has(link.url)).map(link => link.url);
  let oldCompetitors = new Set<string>();
  if (previous.data) {
    const prior = await db.from("citation_hijack_opportunities").select("dead_competitor_url,target_url").eq("audit_id", previous.data.id).eq("opportunity_type", "competitor_direct_404");
    if (prior.error) throw prior.error;
    oldCompetitors = new Set((prior.data ?? []).map(item => item.dead_competitor_url ?? item.target_url));
  }
  let competitors: string[] = [];
  try {
    const detected = await (overrides.detect ?? findCompetitor404Opportunities)({ auditId, domain: report.domain, competitorDomains: report.competitorDomains ?? [], citationUrls: report.extractedUrls, prompt: (report.buyerPrompts ?? [report.buyerPrompt]).join("\n"), citedEngine: report.providerUsed ?? "unknown", responseText: report.generatedText });
    competitors = detected.opportunities.filter(item => item.opportunity_type === "competitor_direct_404").map(item => item.dead_competitor_url ?? item.target_url).filter(url => !oldCompetitors.has(url));
  } catch { console.warn("Weekly competitor scan was unavailable."); }
  if (broken.length || competitors.length) await (overrides.notify ?? notifyWorkspace)(report.domain, { kind: "weekly", domain: report.domain, broken, competitors }, userId);
}
