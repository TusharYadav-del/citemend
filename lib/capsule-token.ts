import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { CapsuleError } from "./citation-capsule";
const key = (secret: string) => createHash("sha256").update("citemend:capsule-export:v1:" + secret).digest();
export function sealCapsuleSchema(userId: string, schema: string, secret: string, now = Date.now()): string {
  if (schema.length > 10_000) throw new CapsuleError("The capsule schema is too large. Generate it again.");
  if (!secret) throw new CapsuleError("Capsule export is not configured.", 503);
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({userId,schema,expires:now + 15 * 60_000}), "utf8"),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(value => value.toString("base64url")).join(".");
}
export function openCapsuleSchema(token: string, userId: string, secret: string, now = Date.now()): string {
  try {
    if (!secret || token.length > 16_000) throw new Error();
    const parts = token.split("."); if (parts.length !== 3) throw new Error();
    const [iv,tag,data] = parts.map(part => Buffer.from(part,"base64url"));
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm",key(secret),iv); decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString("utf8"));
    if (payload.userId !== userId || typeof payload.schema !== "string" || !Number.isFinite(payload.expires) || payload.expires <= now) throw new Error();
    return payload.schema;
  } catch { throw new CapsuleError("This capsule export expired or is invalid. Generate it again.", 410); }
}
