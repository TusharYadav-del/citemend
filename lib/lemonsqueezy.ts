import "server-only";

export async function createLemonSqueezyCheckout(userId: string) {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY?.trim();
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID?.trim();
  const productId = process.env.LEMON_SQUEEZY_PRODUCT_ID?.trim();
  const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID?.trim();
  const isNumericId = (value: string) => value.length > 0 && [...value].every((character) => character >= "0" && character <= "9");

  if (!apiKey || !storeId || !productId || !variantId || !isNumericId(storeId) || !isNumericId(productId) || !isNumericId(variantId) || !Number.isSafeInteger(Number(variantId))) {
    throw new Error("Lemon Squeezy checkout is not configured.");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: { custom: { user_id: userId } },
          product_options: {
            enabled_variants: [Number(variantId)],
            redirect_url: `${appUrl.replace(/\/$/, "")}/dashboard?billing=success`,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error("Lemon Squeezy could not create a checkout.");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("Lemon Squeezy returned an invalid checkout.");
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== "object") throw new Error("Lemon Squeezy returned an invalid checkout.");
  const attributes = (data as Record<string, unknown>).attributes;
  if (!attributes || typeof attributes !== "object") throw new Error("Lemon Squeezy returned an invalid checkout.");
  const checkoutUrl = (attributes as Record<string, unknown>).url;
  if (typeof checkoutUrl !== "string") throw new Error("Lemon Squeezy returned an invalid checkout.");
  const parsed = new URL(checkoutUrl);
  if (parsed.protocol !== "https:" || !(parsed.hostname === "lemonsqueezy.com" || parsed.hostname.endsWith(".lemonsqueezy.com"))) {
    throw new Error("Lemon Squeezy returned an untrusted checkout URL.");
  }
  return parsed.href;
}
