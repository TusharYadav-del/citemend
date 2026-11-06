import { createServerDatabase } from "@/lib/supabase-server";
import { createForensicTeaserHandler, runPublicForensicTeaser, teaserRateLimitKey } from "@/lib/forensic-teaser";

export const maxDuration = 60;

export const POST = createForensicTeaserHandler({
  consumeRateLimit: async (request) => {
    const key = teaserRateLimitKey(request, "scan");
    const { data, error } = await createServerDatabase().rpc("consume_forensic_teaser_rate_limit", { p_key_id: key, p_limit: 5 });
    if (error) throw error;
    return data === true;
  },
  run: runPublicForensicTeaser,
});
