import "server-only";
import dns from "node:dns/promises";

const DISPOSABLE = new Set(["mailinator.com","tempmail.com","10minutemail.com","guerrillamail.com","yopmail.com"]);
const ROLE = /^(info|hello|contact|support|sales|admin|office|team|marketing|press|careers|jobs|billing|noreply|no-reply)$/i;
export type EmailStatus = "verified" | "risky" | "unknown" | "invalid" | "disposable";
export async function verifyContactEmail(email: string, options: { resolveMx?: typeof dns.resolveMx; expectedDomain?: string } = {}): Promise<{ status: EmailStatus; normalized: string; domain: string | null; hasMx: boolean | null; role: boolean }> {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { status: "invalid", normalized, domain: null, hasMx: false, role: false };
  const [local, domain = ""] = normalized.split("@"); const role = ROLE.test(local.split("+")[0]);
  const expected = options.expectedDomain?.toLowerCase().replace(/^www\./, "");
  if (expected && domain !== expected && !domain.endsWith(`.${expected}`)) return { status: "invalid", normalized, domain, hasMx: null, role };
  if (DISPOSABLE.has(domain)) return { status: "disposable", normalized, domain, hasMx: false, role };
  let hasMx: boolean | null = null;
  try { const records = await (options.resolveMx ?? dns.resolveMx)(domain); hasMx = records.length > 0 && records.some(record => record.exchange !== "."); } catch (error) { const code = (error as NodeJS.ErrnoException).code; hasMx = code === "ENODATA" || code === "ENOTFOUND" ? false : null; }
  const status: EmailStatus = hasMx === false ? "invalid" : hasMx === null ? "unknown" : role ? "risky" : "verified";
  return { status, normalized, domain, hasMx, role };
}
