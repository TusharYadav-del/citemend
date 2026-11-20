import { normalizeDashboardDomain } from "./audit-dashboard";

export function mergeWorkspaceDomain(domains: string[], value: string): { domain: string; domains: string[] } {
  const domain = normalizeDashboardDomain(value);
  return { domain, domains: domains.includes(domain) ? domains : [...domains, domain] };
}
