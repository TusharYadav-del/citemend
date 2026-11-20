import type { BillingTier } from "./billing-checkout";

export function billingSignInHref(tier: BillingTier): string {
  const returnTo = `/dashboard/billing?checkout=${tier}`;
  return `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
}

export function billingReturnUrl(origin: string, tier: BillingTier): string {
  return `${origin}/dashboard/billing?billing=success&checkout=${tier}`;
}
