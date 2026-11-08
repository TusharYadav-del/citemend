import "server-only";
import { createServerDatabase } from "./supabase-server";
import { signedUrlFresh, trustedBillingUrl } from "./billing-webhook";

type SubscriptionUrls = { id: string; user_id: string; customer_portal_url: string | null; update_payment_method_url: string | null };

export async function freshBillingUrls(row: SubscriptionUrls) {
  if (signedUrlFresh(row.customer_portal_url) && signedUrlFresh(row.update_payment_method_url)) {
    return { customerPortalUrl: row.customer_portal_url!, updatePaymentMethodUrl: row.update_payment_method_url! };
  }
  if (!/^\d+$/.test(row.id)) throw new Error("This subscription has no provider billing portal.");
  const key = (process.env.LEMONSQUEEZY_API_KEY || process.env.LEMON_SQUEEZY_API_KEY)?.trim();
  if (!key) throw new Error("LEMONSQUEEZY_API_KEY is required for subscription management.");
  const response = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(row.id)}`, {
    headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Lemon Squeezy could not refresh the billing portal.");
  const payload = await response.json() as { data?: { id?: unknown; attributes?: { urls?: { customer_portal?: unknown; update_payment_method?: unknown } } } };
  if (payload.data?.id !== row.id) throw new Error("Lemon Squeezy returned a different subscription.");
  const customerPortalUrl = trustedBillingUrl(payload.data?.attributes?.urls?.customer_portal);
  const updatePaymentMethodUrl = trustedBillingUrl(payload.data?.attributes?.urls?.update_payment_method);
  if (!customerPortalUrl || !updatePaymentMethodUrl) throw new Error("Lemon Squeezy returned no trusted billing URLs.");
  await createServerDatabase().from("subscriptions").update({ customer_portal_url: customerPortalUrl, update_payment_method_url: updatePaymentMethodUrl })
    .eq("id", row.id).eq("user_id", row.user_id);
  return { customerPortalUrl, updatePaymentMethodUrl };
}
