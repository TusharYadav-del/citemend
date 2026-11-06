import { createServerDatabase } from "@/lib/supabase-server";
import { createAgencyReferralTrackingHandler } from "@/lib/agency-referrals";

export const POST = createAgencyReferralTrackingHandler({
  recordVisit: async (code) => {
    const { data, error } = await createServerDatabase().rpc("record_agency_referral_visit", { p_referral_code: code });
    if (error) throw error;
    return data === true;
  },
});
