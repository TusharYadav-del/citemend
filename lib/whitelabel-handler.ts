import "server-only";
import { normalizeDashboardDomain } from "./audit-dashboard";
import { readRequestJson } from "./read-request-json";
import { validateAgencyProfile } from "./agency-whitelabel";
import { getAgencyProfile, saveAgencyProfile } from "./agency-store";
import { createServerDatabase } from "./supabase-server";
import { hasProSubscription } from "./subscription";

type Dependencies = {
  user: () => Promise<string | null>;
  eligible: typeof hasProSubscription;
  owns: (userId: string, domain: string) => Promise<boolean>;
  get: typeof getAgencyProfile;
  save: typeof saveAgencyProfile;
};
const defaults: Dependencies = {
  user: async () => (await (await import("@clerk/nextjs/server")).auth()).userId,
  eligible: hasProSubscription,
  owns: async (userId, domain) => {
    const { data, error } = await createServerDatabase().from("audits").select("id").eq("user_id", userId).eq("domain", domain).limit(1).maybeSingle();
    if (error) throw error;
    return !!data;
  },
  get: getAgencyProfile,
  save: saveAgencyProfile,
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export function createWhiteLabelHandler(overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request): Promise<Response> => {
    try {
      const userId = await deps.user();
      if (!userId) return json({ error: "Sign in to manage white-label settings." }, 401);
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not allowed." }, 403);
      if (!await deps.eligible(userId)) return json({ error: "White-label profiles require Pro, VIP Beta, or Agency access.", code: "PRO_REQUIRED" }, 403);
      let domainInput: unknown;
      let profileInput: unknown;
      if (request.method === "GET") domainInput = new URL(request.url).searchParams.get("domain");
      else {
        const body = await readRequestJson(request, 8192);
        if (body.kind !== "ok" || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) return json({ error: "Provide valid profile settings." }, body.kind === "too_large" ? 413 : 400);
        const value = body.value as Record<string, unknown>;
        domainInput = value.domain; profileInput = value.profile;
      }
      if (typeof domainInput !== "string") return json({ error: "Select a domain." }, 400);
      let domain: string;
      try { domain = normalizeDashboardDomain(domainInput); } catch { return json({ error: "Select a valid domain." }, 400); }
      if (!await deps.owns(userId, domain)) return json({ error: "This domain is not associated with your account." }, 404);
      if (request.method === "GET") return json({ profile: await deps.get(userId, domain) });
      let profile;
      try { profile = validateAgencyProfile(profileInput); } catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid profile." }, 400); }
      await deps.save(userId, domain, profile);
      return json({ profile });
    } catch { return json({ error: "White-label settings are temporarily unavailable." }, 503); }
  };
}
