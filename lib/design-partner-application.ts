import { readRequestJson } from "./read-request-json";
import { normalizeTeaserDomain, type ForensicTeaserReport } from "./forensic-teaser";

export type DesignPartnerSegment = "agency" | "saas" | "ecommerce";
export type DesignPartnerApplication = {
  contactName: string;
  contactEmail: string;
  companyName: string;
  domain: string;
  segment: DesignPartnerSegment;
  clientOrCatalogSize: number;
  buyerPrompt: string;
  primaryPainPoint: string;
};
export type DesignPartnerApplicationRow = DesignPartnerApplication & {
  teaserStatus: "complete" | "partial" | "unavailable";
  teaser: ForensicTeaserReport | null;
};

function parseApplication(value: unknown): DesignPartnerApplication {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Complete the design partner application fields.");
  const row = value as Record<string, unknown>;
  const contactName = typeof row.contactName === "string" ? row.contactName.trim() : "";
  const contactEmail = typeof row.contactEmail === "string" ? row.contactEmail.trim().toLowerCase() : "";
  const companyName = typeof row.companyName === "string" ? row.companyName.trim() : "";
  const buyerPrompt = typeof row.buyerPrompt === "string" ? row.buyerPrompt.trim() : "";
  const primaryPainPoint = typeof row.primaryPainPoint === "string" ? row.primaryPainPoint.trim() : "";
  const segment = row.segment;
  const clientOrCatalogSize = row.clientOrCatalogSize;
  if (!contactName || contactName.length > 120 || !companyName || companyName.length > 160) throw new TypeError("Enter your name and company name.");
  if (contactEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) throw new TypeError("Enter a valid business email address.");
  if (segment !== "agency" && segment !== "saas" && segment !== "ecommerce") throw new TypeError("Choose agency, SaaS, or ecommerce.");
  if (typeof clientOrCatalogSize !== "number" || !Number.isInteger(clientOrCatalogSize) || clientOrCatalogSize < (segment === "agency" ? 5 : 1) || clientOrCatalogSize > (segment === "agency" ? 50 : 1_000_000)) throw new TypeError(segment === "agency" ? "Agency applicants should manage 5 to 50 clients." : "Enter a positive content library or catalog size.");
  if (buyerPrompt.length < 8 || buyerPrompt.length > 4000) throw new TypeError("Enter one buyer prompt between 8 and 4000 characters.");
  if (primaryPainPoint.length < 12 || primaryPainPoint.length > 1200) throw new TypeError("Describe your primary AI search pain point in 12 to 1200 characters.");
  return { contactName, contactEmail, companyName, domain: normalizeTeaserDomain(row.domain), segment, clientOrCatalogSize, buyerPrompt, primaryPainPoint };
}

export type DesignPartnerApplicationDependencies = {
  consumeRateLimit: (request: Request) => Promise<boolean>;
  runTeaser: (domain: string, buyerPrompt: string) => Promise<ForensicTeaserReport>;
  saveApplication: (row: DesignPartnerApplicationRow) => Promise<void>;
};

function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "no-store" } }); }

export function createDesignPartnerApplicationHandler(dependencies: DesignPartnerApplicationDependencies) {
  return async function handle(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    if (origin) {
      try { if (new URL(origin).origin !== new URL(request.url).origin) return json({ error: "Cross-origin submissions are not allowed." }, 403); }
      catch { return json({ error: "Invalid request origin." }, 403); }
    }
    const parsed = await readRequestJson(request, 12_288);
    if (parsed.kind === "too_large") return json({ error: "Application exceeds 12 KiB." }, 413);
    if (parsed.kind !== "ok") return json({ error: "Send a valid JSON application." }, 400);
    let application: DesignPartnerApplication;
    try { application = parseApplication(parsed.value); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid application." }, 400); }
    try {
      if (!await dependencies.consumeRateLimit(request)) return json({ error: "Applications are limited to five submissions per minute. Try again shortly." }, 429);
    } catch { return json({ error: "The application limiter is unavailable. Please retry later." }, 503); }

    let teaser: ForensicTeaserReport | null = null;
    try { teaser = await dependencies.runTeaser(application.domain, application.buyerPrompt); }
    catch { /* Keep the prospect's application even if external scan providers are unavailable. */ }
    const row: DesignPartnerApplicationRow = { ...application, teaserStatus: teaser?.status ?? "unavailable", teaser };
    try { await dependencies.saveApplication(row); }
    catch { return json({ error: "We could not save your application. Please retry later." }, 503); }
    return json({
      received: true,
      message: "Your application was received. The forensic teaser ran with the information currently available.",
      teaserStatus: row.teaserStatus,
      teaser,
      disclosure: "A modeled answer is not a native observation of a commercial AI engine, and the scan cannot inspect private model reasoning.",
    }, 201);
  };
}
