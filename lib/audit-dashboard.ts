import type { AuditFinding, AuditReport } from "./audit-pipeline";

export type DashboardReport = AuditReport & { auditId: string; createdAt: string };

export function citationHealth(findings: AuditFinding[]) {
  const verified = findings.filter((finding) => finding.httpStatus !== null);
  const healthy = verified.filter((finding) => finding.httpStatus! >= 200 && finding.httpStatus! < 300).length;
  return { score: verified.length ? Math.round(100 * healthy / verified.length) : null, verified: verified.length, healthy, unknown: findings.length - verified.length };
}

/** Apache mod_alias path-prefix rule; does not match query strings. */
export function redirectRule(sourceUrl: string, destinationUrl: string): string {
  const source = new URL(sourceUrl), destination = new URL(destinationUrl);
  if (![source, destination].every((url) => ["http:", "https:"].includes(url.protocol) && !url.username && !url.password)) throw new Error("Redirect rules require valid HTTP URLs.");
  return `Redirect 301 "${source.pathname}" "${destination.href}"`;
}

export function normalizeDashboardDomain(value: string): string {
  const input = value.trim();
  const parsed = new URL(input.includes("://") ? input : `https://${input}`);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash || !parsed.hostname.includes(".")) throw new Error("Enter a domain only, such as stripe.com, without a page path.");
  return parsed.hostname.toLowerCase();
}

/** Validate every field used during rendering before accepting an API response. */
export function parseDashboardReport(value: unknown): DashboardReport {
  const fail = () => { throw new Error("The audit returned an unexpected report. Please try again."); };
  if (!value || typeof value !== "object") return fail();
  const report = value as Record<string, unknown>;
  function httpUrl(value: unknown): boolean {
    if (typeof value !== "string") return false;
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  }
  if (typeof report.auditId !== "string" || !report.auditId || typeof report.domain !== "string" || typeof report.generatedText !== "string" || !["completed", "partial"].includes(String(report.status)) || typeof report.sitemapUrlCount !== "number" || !Number.isInteger(report.sitemapUrlCount) || report.sitemapUrlCount < 0 || !Array.isArray(report.warnings) || !report.warnings.every((warning) => typeof warning === "string") || !Array.isArray(report.findings)) return fail();
  for (const entry of report.findings) {
    if (!entry || typeof entry !== "object") return fail();
    const finding = entry as Record<string, unknown>;
    if (!httpUrl(finding.url) || !(finding.httpStatus === null || typeof finding.httpStatus === "number" && Number.isInteger(finding.httpStatus) && finding.httpStatus >= 100 && finding.httpStatus <= 599) || !(finding.suggestedRedirect === null || httpUrl(finding.suggestedRedirect)) || !(finding.error === null || typeof finding.error === "string")) return fail();
  }
  if (report.searchGrounding !== undefined && (!report.searchGrounding || typeof report.searchGrounding !== "object" || !["available", "unavailable", "not_configured"].includes(String((report.searchGrounding as Record<string, unknown>).status)))) return fail();
  return value as DashboardReport;
}
