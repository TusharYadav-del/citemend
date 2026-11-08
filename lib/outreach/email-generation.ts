import "server-only";
import { createUnsubscribeToken } from "./suppression";

export type EmailEvidence = { claim: string; sourceUrl: string; quote: string; kind: string };
export type GeneratedOutreachEmail = { subject: string; text: string; html: string; factualityReport: { passed: boolean; claims: EmailEvidence[]; checkedAt: string } };
const esc = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function generateEvidenceBackedEmail(input: { companyName: string; contactName?: string | null; domain: string; evidence: EmailEvidence[]; email: string; appOrigin: string; tokenSecret?: string }): GeneratedOutreachEmail | null {
  if (!input.evidence.length || input.evidence.some(item => !item.sourceUrl || !item.quote.trim())) return null;
  const broken = input.evidence.find(item => item.kind === "404" || item.kind === "410");
  if (!broken) return null;
  const token = createUnsubscribeToken(input.email, input.tokenSecret ?? process.env.OUTREACH_TOKEN_SECRET ?? process.env.CRON_SECRET ?? "");
  const reportUrl = `${input.appOrigin.replace(/\/$/, "")}/report/${encodeURIComponent(input.domain)}`;
  const unsubscribeUrl = `${input.appOrigin.replace(/\/$/, "")}/api/outreach/unsubscribe?token=${encodeURIComponent(token)}`;
  const greeting = input.contactName ? `Hi ${input.contactName.split(/\s+/)[0]},` : "Hello,";
  const subject = `A citation destination check for ${input.companyName}`;
  const text = `${greeting}\n\nCiteMend's generated research answer for ${input.companyName} included ${broken.quote.slice(0, 240)}. Our DNS-pinned HTTP check returned ${broken.kind}. The report shows the recorded answer and verification details: ${reportUrl}\n\nFind broken AI citations. Repair the destination. Verify the result. CiteMend helps teams inspect cited URLs, review relevant replacements, and verify approved redirects — with an evidence trail for every action.\n\nIf this is not useful, unsubscribe here: ${unsubscribeUrl}`;
  const html = `<main style="font:16px/1.55 Arial,sans-serif;color:#19362b"><p>${esc(greeting)}</p><p>CiteMend's generated research answer for ${esc(input.companyName)} included <a href="${esc(broken.quote)}">${esc(broken.quote)}</a>. Our DNS-pinned HTTP check returned <strong>${esc(broken.kind)}</strong>. The report shows the recorded answer and verification details: <a href="${esc(reportUrl)}">view the citation report</a>.</p><p>Find broken AI citations. Repair the destination. Verify the result. CiteMend helps teams inspect cited URLs, review relevant replacements, and verify approved redirects — with an evidence trail for every action.</p><p style="font-size:12px;color:#667">If this is not useful, <a href="${esc(unsubscribeUrl)}">unsubscribe with one click</a>.</p></main>`;
  return { subject, text, html, factualityReport: { passed: true, claims: input.evidence, checkedAt: new Date().toISOString() } };
}

export function validateFactualityReport(report: GeneratedOutreachEmail["factualityReport"]): boolean {
  return report.passed && report.claims.length > 0 && report.claims.every(item => item.claim.trim() && /^https:\/\//.test(item.sourceUrl) && item.quote.trim() && ["200", "301", "404", "410"].includes(item.kind));
}
