import "server-only";
import type { ClientOptions } from "dodopayments";
import { createDodoClient } from "./billing-checkout";

export async function createBillingPortalSession(customerId: string, userId: string, fetcher?: ClientOptions["fetch"]): Promise<string> {
  if (!/^cus_[A-Za-z0-9_-]+$/.test(customerId) || !/^user_[A-Za-z0-9]+$/.test(userId)) throw new Error("A valid Dodo customer is required.");
  const rawOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://citemend.vercel.app";
  let origin: URL;
  try { origin = new URL(rawOrigin); } catch { throw new Error("NEXT_PUBLIC_APP_URL must be an absolute URL."); }
  const local = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  if ((origin.protocol !== "https:" && !(local && origin.protocol === "http:")) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("NEXT_PUBLIC_APP_URL must be a trusted HTTPS origin.");
  }
  const result = await createDodoClient(fetcher ? { fetch: fetcher } : {}).customers.customerPortal.create(customerId, { return_url: `${origin.origin}/dashboard/billing` });
  const url = new URL(result.link);
  if (url.protocol !== "https:" || !(url.hostname === "dodopayments.com" || url.hostname.endsWith(".dodopayments.com"))) throw new Error("Dodo Payments returned an untrusted customer portal URL.");
  return url.href;
}
