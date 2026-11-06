const REFERRAL_CODE = /^agency_[a-f0-9]{24}$/;

export function normalizeAgencyReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return REFERRAL_CODE.test(normalized) ? normalized : null;
}

export function buildAgencyReferralLink(origin: string, code: string, options: { domain?: string; agency?: string } = {}): string {
  const safeCode = normalizeAgencyReferralCode(code);
  const url = new URL("/forensic-scan", origin);
  if (!safeCode) throw new TypeError("Invalid agency referral code.");
  url.searchParams.set("ref", safeCode);
  if (options.domain) url.searchParams.set("domain", options.domain);
  if (options.agency) url.searchParams.set("agency", options.agency.slice(0, 100));
  return url.toString();
}
