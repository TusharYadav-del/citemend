import { createDesignPartnerApplicationHandler } from "@/lib/design-partner-application";
import { runPublicForensicTeaser, teaserRateLimitKey } from "@/lib/forensic-teaser";
import { createServerDatabase } from "@/lib/supabase-server";

export const maxDuration = 60;

export const POST = createDesignPartnerApplicationHandler({
  consumeRateLimit: async (request) => {
    const key = teaserRateLimitKey(request, "application");
    const { data, error } = await createServerDatabase().rpc("consume_forensic_teaser_rate_limit", { p_key_id: key, p_limit: 5 });
    if (error) throw error;
    return data === true;
  },
  runTeaser: runPublicForensicTeaser,
  saveApplication: async (row) => {
    const { error } = await createServerDatabase().from("design_partner_applications").insert({
      contact_name: row.contactName,
      contact_email: row.contactEmail,
      company_name: row.companyName,
      domain: row.domain,
      segment: row.segment,
      client_or_catalog_size: row.clientOrCatalogSize,
      buyer_prompt: row.buyerPrompt,
      primary_pain_point: row.primaryPainPoint,
      teaser_status: row.teaserStatus,
      teaser_json: row.teaser as unknown as Record<string, unknown> | null,
    });
    if (error) throw error;
  },
});
