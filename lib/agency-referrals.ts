import { randomBytes } from "node:crypto";
import { normalizeAgencyReferralCode } from "./referral-code";
export { normalizeAgencyReferralCode, buildAgencyReferralLink } from "./referral-code";

export const AGENCY_REFERRAL_COOKIE = "citemend_agency_referral";
export function createAgencyReferralCode(randomHex = randomBytes(12).toString("hex")): string {
  if (!/^[a-f0-9]{24}$/i.test(randomHex)) throw new TypeError("Referral entropy must be 24 hexadecimal characters.");
  return `agency_${randomHex.toLowerCase()}`;
}

export function getAgencyReferralCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name !== AGENCY_REFERRAL_COOKIE) continue;
    try { return normalizeAgencyReferralCode(decodeURIComponent(valueParts.join("="))); }
    catch { return null; }
  }
  return null;
}

export type ReferralTrackingDependencies = {
  recordVisit: (code: string) => Promise<boolean>;
  cookieName?: string;
};

export function createAgencyReferralTrackingHandler(dependencies: ReferralTrackingDependencies) {
  return async function handle(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    if (origin) {
      try { if (new URL(origin).origin !== new URL(request.url).origin) return Response.json({ error: "Cross-origin tracking is not allowed." }, { status: 403 }); }
      catch { return Response.json({ error: "Invalid request origin." }, { status: 403 }); }
    }
    const code = normalizeAgencyReferralCode(new URL(request.url).searchParams.get("ref"));
    if (!code) return Response.json({ tracked: false }, { status: 400, headers: { "Cache-Control": "no-store" } });
    let tracked = false;
    try { tracked = getAgencyReferralCookie(request) === code || await dependencies.recordVisit(code); }
    catch { return Response.json({ error: "Referral tracking is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
    if (!tracked) return Response.json({ tracked: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    const cookie = `${dependencies.cookieName ?? AGENCY_REFERRAL_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`;
    return Response.json({ tracked: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": cookie } });
  };
}
