import type { UserAuditHistoryItem } from "./audit-history";

export function historyMetrics(audits: UserAuditHistoryItem[]) {
  const latestByDomain = new Map<string, UserAuditHistoryItem>();
  for (const audit of audits) {
    const existing = latestByDomain.get(audit.domain);
    if (!existing || Date.parse(audit.created_at) > Date.parse(existing.created_at)) latestByDomain.set(audit.domain, audit);
  }
  let active404s = 0;
  let redirectsReady = 0;
  for (const audit of latestByDomain.values()) {
    const broken = audit.broken_links.filter((link) => link.http_status === 404);
    active404s += broken.length;
    redirectsReady += broken.filter((link) => Boolean(link.suggested_redirect)).length;
  }
  return { totalScans: audits.length, active404s, redirectsReady };
}
