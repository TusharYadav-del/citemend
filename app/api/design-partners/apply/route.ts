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
    const db = createServerDatabase();
    const { data, error } = await db.from("design_partner_applications").insert({
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
    }).select("id").single();
    if (error) throw error;
    if (row.referralCode) {
      // Referral attribution is best effort; it must not prevent application intake.
      await db.from("agency_referrals").update({ partner_application_id: data.id, referred_email: row.contactEmail, status: "applied", updated_at: new Date().toISOString() })
        .eq("referral_code", row.referralCode).in("status", ["issued", "visited"]).is("partner_application_id", null);
    }
  },
});
