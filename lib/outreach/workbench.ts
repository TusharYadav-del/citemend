export const DELIVERABILITY_CHECKS = [
  { key: "provider_domain_verified", label: "Sending domain is verified with the email provider" },
  { key: "spf_aligned", label: "SPF record is published and aligned for the sending provider" },
  { key: "dkim_verified", label: "DKIM signing is enabled and verified" },
  { key: "dmarc_published", label: "DMARC record and policy are reviewed" },
  { key: "from_address_aligned", label: "From address uses the authenticated sending domain" },
  { key: "reply_mailbox_monitored", label: "Reply-to mailbox is monitored by a person" },
  { key: "unsubscribe_tested", label: "One-click unsubscribe link has been tested" },
  { key: "suppression_ledger_reviewed", label: "Suppression and opt-out ledger has been reviewed" },
] as const;

export type DeliverabilityKey = typeof DELIVERABILITY_CHECKS[number]["key"];
export type DeliverabilityChecklist = Record<DeliverabilityKey, boolean>;

export const EMPTY_DELIVERABILITY_CHECKLIST: DeliverabilityChecklist = {
  provider_domain_verified: false,
  spf_aligned: false,
  dkim_verified: false,
  dmarc_published: false,
  from_address_aligned: false,
  reply_mailbox_monitored: false,
  unsubscribe_tested: false,
  suppression_ledger_reviewed: false,
};

export function normalizeSendingDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (domain.length > 253 || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return null;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return null;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(domain) || /(?:^|\.)(?:localhost|local|internal|test)$/.test(domain)) return null;
  return domain;
}

export function parseDeliverabilityChecklist(value: unknown): DeliverabilityChecklist | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = DELIVERABILITY_CHECKS.map(item => item.key);
  if (Object.keys(input).some(key => !keys.includes(key as DeliverabilityKey))) return null;
  if (keys.some(key => typeof input[key] !== "boolean")) return null;
  return Object.fromEntries(keys.map(key => [key, input[key]])) as DeliverabilityChecklist;
}

export function isDeliverabilityReady(value: unknown): boolean {
  const checklist = parseDeliverabilityChecklist(value);
  return !!checklist && DELIVERABILITY_CHECKS.every(({ key }) => checklist[key]);
}

export function isReviewableOneExample(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  if (report.passed !== true || !Array.isArray(report.claims) || report.claims.length !== 1) return false;
  const claim = report.claims[0];
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return false;
  const item = claim as Record<string, unknown>;
  if (![404, 410].includes(Number(item.status)) || !Number.isFinite(Date.parse(String(item.detectedAt ?? "")))) return false;
  if (typeof item.referrerContext !== "string" || !item.referrerContext.trim()) return false;
  if (typeof item.replacementReason !== "string" || !item.replacementReason.trim()) return false;
  try {
    const dead = new URL(String(item.deadUrl));
    const referrer = new URL(String(item.referrerUrl));
    const replacement = new URL(String(item.replacementUrl));
    return [dead, referrer, replacement].every(url => url.protocol === "https:")
      && dead.username === "" && dead.password === ""
      && referrer.username === "" && referrer.password === ""
      && replacement.username === "" && replacement.password === ""
      && dead.hostname.toLowerCase() === replacement.hostname.toLowerCase()
      && dead.pathname.toLowerCase().replace(/\/+$/, "") !== replacement.pathname.toLowerCase().replace(/\/+$/, "");
  } catch { return false; }
}

export function canFounderApproveDraft(input: {
  outboundEnabled: boolean;
  sendingDomain: unknown;
  checklist: unknown;
  status: string;
  suppressed: boolean;
  factualityReport: unknown;
}): boolean {
  return input.outboundEnabled === true
    && normalizeSendingDomain(input.sendingDomain) !== null
    && isDeliverabilityReady(input.checklist)
    && input.status === "draft_locked"
    && !input.suppressed
    && isReviewableOneExample(input.factualityReport);
}

export function normalizeSuppressionEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email)) return null;
  const domain = email.split("@").at(-1);
  return normalizeSendingDomain(domain) ? email : null;
}
