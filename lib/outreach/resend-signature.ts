import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyResendSignature(raw: string, headers: { id: string; timestamp: string; signature: string }, secret: string, now = Date.now()): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature || !Number.isFinite(Number(headers.timestamp)) || Math.abs(now / 1000 - Number(headers.timestamp)) > 300) return false;
  try {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${raw}`).digest();
    return headers.signature.split(" ").some(part => { const value = part.split(",")[1]; if (!value) return false; const actual = Buffer.from(value, "base64"); return actual.length === expected.length && timingSafeEqual(actual, expected); });
  } catch { return false; }
}
