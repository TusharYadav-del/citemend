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
