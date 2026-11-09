import "server-only";
import { createUnsubscribeToken } from "./suppression";

export type EmailEvidence = {
  deadUrl: string;
  status: 404 | 410;
  detectedAt: string;
  referrerUrl: string;
  referrerContext: string;
  replacementUrl: string | null;
  replacementReason: string | null;
};
export type GeneratedOutreachEmail = {
  subject: string;
  text: string;
  html: string;
  factualityReport: { passed: boolean; claims: EmailEvidence[]; checkedAt: string; approvalStatus: "pending_founder_review" };
};
const esc = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
function isHttps(value: string) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function sameDomain(url: string, domain: string) {
  try { const host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); return host === domain.toLowerCase().replace(/^www\./, ""); }
  catch { return false; }
}

export function generateEvidenceBackedEmail(input: { companyName: string; contactName?: string | null; domain: string; evidence: EmailEvidence[]; email: string; appOrigin: string; tokenSecret?: string }): GeneratedOutreachEmail | null {
  if (input.evidence.length !== 1 || !/^[a-z0-9.-]+$/i.test(input.domain)) return null;
  const example = input.evidence[0];
  if (!isHttps(example.deadUrl) || !sameDomain(example.deadUrl, input.domain)
    || !isHttps(example.referrerUrl) || !example.referrerContext.trim()
    || !example.replacementUrl || !isHttps(example.replacementUrl) || !sameDomain(example.replacementUrl, input.domain)
    || !example.replacementReason?.trim() || !Number.isFinite(Date.parse(example.detectedAt))
    || (example.status !== 404 && example.status !== 410)) return null;
  let origin: URL;
  try { origin = new URL(input.appOrigin); } catch { return null; }
  if (origin.protocol !== "https:") return null;
  const token = createUnsubscribeToken(input.email, input.tokenSecret ?? process.env.OUTREACH_TOKEN_SECRET ?? process.env.CRON_SECRET ?? "");
  const reportUrl = new URL(`/report/${encodeURIComponent(input.domain)}`, origin).href;
  const unsubscribeUrl = new URL(`/api/outreach/unsubscribe?token=${encodeURIComponent(token)}`, origin).href;
  const greeting = input.contactName ? `Hi ${input.contactName.split(/\s+/)[0]},` : "Hello,";
  const date = new Date(example.detectedAt).toISOString().slice(0, 10);
  const subject = `One verified citation URL for ${input.companyName}`;
  const text = `${greeting}\n\nI checked one citation URL on ${input.domain}:\n\nDead URL: ${example.deadUrl}\nObserved HTTP status: ${example.status}\nDetection date: ${date}\nCitation / referrer: ${example.referrerUrl}\nObserved context: ${example.referrerContext.slice(0, 400)}\nSuggested live replacement: ${example.replacementUrl}\nMatch reason: ${example.replacementReason.slice(0, 300)}\n\nWould you like me to share the full self-serve report? ${reportUrl}\n\nIf not, opt out with one click: ${unsubscribeUrl}`;
  const html = `<main style="font:16px/1.55 Arial,sans-serif;color:#19362b"><p>${esc(greeting)}</p><p>I checked one citation URL on ${esc(input.domain)}:</p><ul><li>Dead URL: <a href="${esc(example.deadUrl)}">${esc(example.deadUrl)}</a></li><li>Observed HTTP status: ${example.status}; detected ${esc(date)}</li><li>Citation / referrer: <a href="${esc(example.referrerUrl)}">${esc(example.referrerUrl)}</a></li><li>Observed context: ${esc(example.referrerContext.slice(0, 400))}</li><li>Suggested live replacement: <a href="${esc(example.replacementUrl)}">${esc(example.replacementUrl)}</a></li><li>Match reason: ${esc(example.replacementReason.slice(0, 300))}</li></ul><p>Would you like me to share the <a href="${esc(reportUrl)}">full self-serve report</a>?</p><p style="font-size:12px;color:#667"><a href="${esc(unsubscribeUrl)}">Opt out with one click</a>.</p></main>`;
  return { subject, text, html, factualityReport: { passed: true, claims: [example], checkedAt: new Date().toISOString(), approvalStatus: "pending_founder_review" } };
}

export function validateFactualityReport(report: GeneratedOutreachEmail["factualityReport"]): boolean {
  if (!report.passed || report.approvalStatus !== "pending_founder_review" || report.claims.length !== 1) return false;
  const item = report.claims[0];
  return [item.deadUrl, item.referrerUrl, item.replacementUrl ?? ""].every(isHttps)
    && !!item.referrerContext.trim() && !!item.replacementReason?.trim()
    && Number.isFinite(Date.parse(item.detectedAt)) && [404, 410].includes(item.status);
}
