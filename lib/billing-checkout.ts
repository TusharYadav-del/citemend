import "server-only";
import DodoPayments, { type ClientOptions } from "dodopayments";

export type BillingTier = "pilot" | "growth" | "agency";
export class BillingConfigError extends Error {}
export class BillingProviderError extends Error {}

export function isBillingEnabled(): boolean {
  return process.env.DODO_PAYMENTS_ENABLED === "true"
    && !!process.env.DODO_PAYMENTS_API_KEY?.trim()
    && !!process.env.DODO_PRODUCT_PILOT_ID?.trim()
    && !!process.env.DODO_PRODUCT_GROWTH_ID?.trim()
    && !!process.env.DODO_PRODUCT_AGENCY_ID?.trim();
}

export function productForTier(tier: BillingTier): string {
  const envName = tier === "pilot" ? "DODO_PRODUCT_PILOT_ID" : tier === "growth" ? "DODO_PRODUCT_GROWTH_ID" : "DODO_PRODUCT_AGENCY_ID";
  const id = process.env[envName]?.trim();
  if (!id || !/^[A-Za-z0-9_-]{3,100}$/.test(id)) throw new BillingConfigError(`${envName} must be configured with a Dodo product ID.`);
  return id;
}

export function createDodoClient(overrides: Partial<ClientOptions> = {}) {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
  if (!apiKey) throw new BillingConfigError("DODO_PAYMENTS_API_KEY is required for billing.");
  const mode = process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? "test_mode" : "live_mode";
  return new DodoPayments({ bearerToken: apiKey, webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY, environment: mode, ...overrides });
}

function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://citemend.vercel.app";
  let url: URL;
  try { url = new URL(raw); } catch { throw new BillingConfigError("NEXT_PUBLIC_APP_URL must be an absolute URL."); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new BillingConfigError("NEXT_PUBLIC_APP_URL must be a trusted HTTPS origin.");
  }
  return url.origin;
}

export async function createBillingCheckout(tier: BillingTier, userId: string, email: string, workspaceId: string, fetcher?: ClientOptions["fetch"]): Promise<string> {
  if (!/^user_[A-Za-z0-9]+$/.test(userId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^(?:user|org)_[A-Za-z0-9]+$/.test(workspaceId)) throw new BillingConfigError("An authenticated Clerk user, email, and workspace are required.");
  const productId = productForTier(tier);
  const origin = appOrigin();
  try {
    const checkout = await createDodoClient(fetcher ? { fetch: fetcher } : {}).checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email },
      metadata: { user_id: userId, user_email: email, plan_tier: tier, workspace_id: workspaceId },
      return_url: `${origin}/dashboard?billing=success`,
      cancel_url: `${origin}/pricing?billing=cancelled`,
    });
    if (typeof checkout.checkout_url !== "string") throw new BillingProviderError("Dodo Payments returned no checkout URL.");
    const url = new URL(checkout.checkout_url);
    if (url.protocol !== "https:" || !["checkout.dodopayments.com", "test.checkout.dodopayments.com"].includes(url.hostname)) throw new BillingProviderError("Dodo Payments returned an untrusted checkout URL.");
    return url.href;
  } catch (error) {
    if (error instanceof BillingConfigError || error instanceof BillingProviderError) throw error;
    throw new BillingProviderError("Dodo Payments could not create a checkout.");
  }
}
