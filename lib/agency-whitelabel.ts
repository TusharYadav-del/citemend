export type AgencyProfile = {
  agency_brand_name: string | null;
  agency_logo_url: string | null;
  agency_primary_color: string;
  agency_cta_text: string | null;
  agency_cta_url: string | null;
};

export const DEFAULT_AGENCY_COLOR = "#10B981";

function cleanText(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("Enter valid profile text.");
  return value.trim() || null;
}

function publicHttps(value: unknown): string | null {
  const text = cleanText(value, 2048);
  if (!text) return null;
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port || !host.includes(".") || !/^[a-z0-9.-]+$/.test(host) || /(?:^|\.)(?:localhost|local|internal)$/.test(host) || /^\d+(?:\.\d+)*$/.test(host)) throw new Error();
    return url.href;
  } catch { throw new Error("Logo and booking links must use a public HTTPS URL."); }
}

export function validateAgencyProfile(value: unknown): AgencyProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provide a white-label profile.");
  const input = value as Record<string, unknown>;
  const color = input.agency_primary_color === undefined || input.agency_primary_color === "" || input.agency_primary_color === null ? DEFAULT_AGENCY_COLOR : input.agency_primary_color;
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Choose a six-digit hex color.");
  const profile = { agency_brand_name: cleanText(input.agency_brand_name, 120), agency_logo_url: publicHttps(input.agency_logo_url), agency_primary_color: color.toUpperCase(), agency_cta_text: cleanText(input.agency_cta_text, 160), agency_cta_url: publicHttps(input.agency_cta_url) };
  if (!!profile.agency_cta_text !== !!profile.agency_cta_url) throw new Error("Provide both CTA text and a booking URL.");
  if (!profile.agency_brand_name && (profile.agency_logo_url || profile.agency_cta_text)) throw new Error("Provide an agency name for your logo or CTA.");
  return profile;
}

/** Stored profiles can predate validation; do not render unsafe values. */
export function readAgencyProfile(value: unknown): AgencyProfile | null {
  try { const profile = validateAgencyProfile(value); return profile.agency_brand_name ? profile : null; } catch { return null; }
}
