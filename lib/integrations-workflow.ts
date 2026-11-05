import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type RedirectRecord = { broken_url: string; destination_url: string; url_state: string; approval_status: string };
const fields = ["broken_url", "destination_url", "url_state", "approval_status"] as const;
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }
export function exportRedirectRecords(records: RedirectRecord[], format: "csv" | "json") {
  if (format === "json") return JSON.stringify(records, null, 2);
  return [fields.join(","), ...records.map(record => fields.map(key => csvCell(record[key])).join(","))].join("\r\n") + "\r\n";
}
export function parseRedirectCsv(input: string): RedirectRecord[] {
  if (input.length > 1_000_000) throw new RangeError("Import exceeds 1 MB.");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted && char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") { row.push(cell); cell = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) { if (char === "\r" && input[i + 1] === "\n") i++; row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new SyntaxError("CSV contains an unclosed quoted field.");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift()?.map(value => value.trim().toLowerCase());
  if (!header || fields.some(field => !header.includes(field))) throw new TypeError("CSV must include broken_url,destination_url,url_state,approval_status columns.");
  if (rows.length > 5000) throw new RangeError("Import is limited to 5,000 rows.");
  return rows.map(values => Object.fromEntries(fields.map(field => [field, values[header.indexOf(field)] ?? ""])) as RedirectRecord)
    .map(value => { for (const url of [value.broken_url, value.destination_url]) { const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new TypeError("Imported redirect URLs must be public HTTPS URLs without credentials."); } return value; });
}
export function parseRedirectImport(input: string, format: "csv" | "json") {
  if (format === "csv") return parseRedirectCsv(input);
  const value: unknown = JSON.parse(input);
  if (!Array.isArray(value) || value.length > 5000) throw new TypeError("JSON redirect import must be an array of at most 5,000 rows.");
  return value.map(row => { if (!row || typeof row !== "object") throw new TypeError("Invalid redirect row."); const item = row as RedirectRecord; for (const key of fields) if (typeof item[key] !== "string") throw new TypeError(`Missing ${key}.`); for (const url of [item.broken_url,item.destination_url]) if (new URL(url).protocol !== "https:") throw new TypeError("Redirect URLs must use HTTPS."); return item; });
}

export function generateWorkspaceApiKey() {
  const secret = randomBytes(32).toString("base64url"); const key = `cm_live_${secret}`;
  return { key, prefix: key.slice(0, 16), hash: createHash("sha256").update(key).digest("hex") };
}
export function verifyWorkspaceApiKey(candidate: string, storedHash: string) {
  if (!/^cm_live_[A-Za-z0-9_-]{32,}$/.test(candidate) || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const actual = Buffer.from(createHash("sha256").update(candidate).digest("hex")); const expected = Buffer.from(storedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type TierName = "free_audit" | "starter" | "growth" | "professional" | "agency" | "enterprise";
export const PLAN_TIERS: Record<TierName, { label: string; usd: string; inr: string; monthlyAudits: number; promptsPerAudit: number; pagesCrawled: number; modelCalls: number }> = {
  free_audit: { label: "Free Audit", usd: "$0", inr: "₹0", monthlyAudits: 1, promptsPerAudit: 3, pagesCrawled: 10, modelCalls: 5 },
  starter: { label: "Starter", usd: "$49–$79/mo", inr: "₹2,999/mo", monthlyAudits: 5, promptsPerAudit: 5, pagesCrawled: 100, modelCalls: 25 },
  growth: { label: "Growth", usd: "$149–$249/mo", inr: "₹8,999/mo", monthlyAudits: 30, promptsPerAudit: 10, pagesCrawled: 1000, modelCalls: 300 },
  professional: { label: "Professional", usd: "$399–$599/mo", inr: "₹19,999/mo", monthlyAudits: 100, promptsPerAudit: 20, pagesCrawled: 5000, modelCalls: 2000 },
  agency: { label: "Agency", usd: "$699–$999/mo", inr: "₹34,999/mo", monthlyAudits: 300, promptsPerAudit: 30, pagesCrawled: 20000, modelCalls: 9000 },
  enterprise: { label: "Enterprise", usd: "$2,500–$10,000+/mo", inr: "Custom", monthlyAudits: 10000, promptsPerAudit: 100, pagesCrawled: 100000, modelCalls: 100000 },
};
export function withinTierQuota(tier: TierName, usage: { audits: number; pages: number; modelCalls: number }) {
  const limit = PLAN_TIERS[tier];
  return usage.audits <= limit.monthlyAudits && usage.pages <= limit.pagesCrawled && usage.modelCalls <= limit.modelCalls;
}

export function webhookEventIdentity(provider: string, eventId: string) {
  if (!/^[a-z0-9_-]{2,40}$/i.test(provider) || !eventId.trim() || eventId.length > 200) throw new TypeError("A valid provider and event ID are required.");
  return `${provider}:${eventId}`;
}
