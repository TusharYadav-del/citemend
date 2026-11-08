import "server-only";

export type BillingTier = "starter" | "growth" | "agency";

export class BillingConfigError extends Error {}
export class BillingProviderError extends Error {}

function numericId(value: string | undefined, name: string): string {
  const id = value?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw new BillingConfigError(`${name} must be a valid numeric Lemon Squeezy ID.`);
  }
  return id;
}

export function variantForTier(tier: BillingTier): string {
  const effective = [
    process.env.LEMONSQUEEZY_STARTER_VARIANT_ID,
    process.env.LEMONSQUEEZY_GROWTH_VARIANT_ID,
    process.env.LEMONSQUEEZY_AGENCY_VARIANT_ID,
  ].map(value => value?.trim()).filter((value): value is string => !!value);
  if (new Set(effective).size !== effective.length) throw new BillingConfigError("Each billing tier needs a distinct Lemon Squeezy variant ID.");
  const setting: [string | undefined, string] = tier === "starter"
    ? [process.env.LEMONSQUEEZY_STARTER_VARIANT_ID, "LEMONSQUEEZY_STARTER_VARIANT_ID"]
    : tier === "growth"
      ? [process.env.LEMONSQUEEZY_GROWTH_VARIANT_ID, "LEMONSQUEEZY_GROWTH_VARIANT_ID"]
    : [process.env.LEMONSQUEEZY_AGENCY_VARIANT_ID, "LEMONSQUEEZY_AGENCY_VARIANT_ID"];
  return numericId(setting[0], setting[1]);
}

function configuredOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) throw new BillingConfigError("NEXT_PUBLIC_APP_URL is required for billing redirects.");
  let url: URL;
  try { url = new URL(raw); } catch { throw new BillingConfigError("NEXT_PUBLIC_APP_URL must be an absolute URL."); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new BillingConfigError("NEXT_PUBLIC_APP_URL must be a trusted HTTPS origin (or localhost for development).");
  }
  return url.origin;
}

export function buildBillingCheckout(tier: BillingTier, userId: string, email: string) {
  if (!/^user_[A-Za-z0-9]+$/.test(userId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BillingConfigError("An authenticated Clerk user and email are required.");
  }
  const storeId = numericId(process.env.LEMONSQUEEZY_STORE_ID || process.env.LEMON_SQUEEZY_STORE_ID, "LEMONSQUEEZY_STORE_ID");
  const variantId = variantForTier(tier);
  return {
    data: {
      type: "checkouts",
      attributes: {
        test_mode: process.env.LEMON_SQUEEZY_TEST_MODE === "true",
        checkout_data: { email, custom: { user_id: userId, user_email: email, plan_tier: tier } },
        product_options: { enabled_variants: [Number(variantId)], redirect_url: `${configuredOrigin()}/dashboard?billing=success` },
      },
      relationships: {
        store: { data: { type: "stores", id: storeId } },
        variant: { data: { type: "variants", id: variantId } },
      },
    },
  };
}

export async function createBillingCheckout(tier: BillingTier, userId: string, email: string): Promise<string> {
  const apiKey = (process.env.LEMONSQUEEZY_API_KEY || process.env.LEMON_SQUEEZY_API_KEY)?.trim();
  if (!apiKey) throw new BillingConfigError("LEMONSQUEEZY_API_KEY is required for checkout.");
  const body = buildBillingCheckout(tier, userId, email);
  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new BillingProviderError(`Lemon Squeezy rejected the checkout (HTTP ${response.status}). Check the store, variant, and API key.`);
  const data: unknown = await response.json();
  const attributes = (data as { data?: { attributes?: { url?: unknown; test_mode?: unknown } } })?.data?.attributes;
  if (body.data.attributes.test_mode && attributes?.test_mode !== true) throw new BillingProviderError("Lemon Squeezy did not confirm test mode.");
  if (typeof attributes?.url !== "string") throw new BillingProviderError("Lemon Squeezy returned no checkout URL.");
  const checkout = new URL(attributes.url);
  const customHost = process.env.LEMONSQUEEZY_PORTAL_HOST?.trim().toLowerCase();
  if (checkout.protocol !== "https:" || !(checkout.hostname === "lemonsqueezy.com" || checkout.hostname.endsWith(".lemonsqueezy.com") || (customHost && checkout.hostname === customHost))) {
    throw new BillingProviderError("Lemon Squeezy returned an untrusted checkout URL.");
  }
  return checkout.href;
}
