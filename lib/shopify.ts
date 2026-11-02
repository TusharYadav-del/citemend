import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const SHOPIFY_ADMIN_API_VERSION = "2026-10";
const ENCRYPTED_TOKEN_VERSION = "v1";
const GRAPHQL_TIMEOUT_MS = 10_000;

const URL_REDIRECT_CREATE = `#graphql
  mutation urlRedirectCreate($urlRedirect: UrlRedirectInput!) {
    urlRedirectCreate(urlRedirect: $urlRedirect) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }
`;
const VERIFY_SHOP = `#graphql
  query VerifyCiteFixShop {
    shop { name myshopifyDomain }
  }
`;

export type ShopifyRedirect = { id: string; path: string; target: string };
export type ShopifyConnectionDetails = { name: string; myshopifyDomain: string };

type ShopifyGraphQLResponse = {
  data?: {
    shop?: ShopifyConnectionDetails;
    urlRedirectCreate?: {
      urlRedirect: ShopifyRedirect | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

function encryptionKey(): Buffer {
  const encodedKey = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encodedKey) throw new Error("Shopify token encryption is not configured.");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("SHOPIFY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

/** Encrypt a Shopify Admin token before storing it in cms_connections.access_token. */
export function encryptShopifyAccessToken(accessToken: string): string {
  if (typeof accessToken !== "string" || accessToken.length < 8 || accessToken.length > 4096 || /\s/.test(accessToken)) {
    throw new Error("Provide a valid Shopify Admin API access token.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENCRYPTED_TOKEN_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Decrypt a previously encrypted cms_connections.access_token value on the server. */
export function decryptShopifyAccessToken(envelope: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== ENCRYPTED_TOKEN_VERSION) {
    throw new Error("The stored Shopify token has an unsupported encrypted format.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(parts[1], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The Shopify token could not be decrypted. Check the configured encryption key.");
  }
}

function validateShopSubdomain(shopSubdomain: string): string {
  const normalized = shopSubdomain.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/.test(normalized)) {
    throw new Error("Shopify shop must be a myshopify.com subdomain.");
  }
  return normalized;
}

async function shopifyGraphQL<T>(shopSubdomain: string, accessToken: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const shop = validateShopSubdomain(shopSubdomain);
  if (typeof accessToken !== "string" || accessToken.length < 8 || accessToken.length > 4096 || /\s/.test(accessToken)) {
    throw new Error("Provide a valid Shopify Admin API access token.");
  }
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
  });

  let result: ShopifyGraphQLResponse;
  try {
    result = await response.json() as ShopifyGraphQLResponse;
  } catch {
    throw new Error(`Shopify returned an invalid GraphQL response (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(`Shopify Admin API request failed (HTTP ${response.status}).`);
  if (result.errors?.length) {
    throw new Error(result.errors.map(error => error.message).filter(Boolean).join("; ").slice(0, 1000) || "Shopify GraphQL request failed.");
  }
  return result as T;
}

/** Validate a merchant-provided token with a minimal Admin GraphQL shop query. */
export async function verifyShopifyConnection(shopSubdomain: string, accessToken: string): Promise<ShopifyConnectionDetails> {
  const result = await shopifyGraphQL<ShopifyGraphQLResponse>(shopSubdomain, accessToken, VERIFY_SHOP);
  const details = result.data?.shop;
  if (!details || typeof details.name !== "string" || typeof details.myshopifyDomain !== "string") {
    throw new Error("Shopify did not return a valid store identity.");
  }
  if (details.myshopifyDomain.toLowerCase() !== validateShopSubdomain(shopSubdomain)) {
    throw new Error("The access token belongs to a different Shopify store.");
  }
  return details;
}

function validatePath(path: string, name: string): string {
  if (typeof path !== "string" || path.length < 2 || path.length > 2048 || !path.startsWith("/")
      || path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f\u007f#]/.test(path)) {
    throw new Error(`${name} must be a local path beginning with a single slash.`);
  }
  return path;
}

/**
 * Create a native Shopify URL redirect. The app needs the `write_online_store_navigation` scope.
 * Supply the decrypted Admin API token only from trusted server-side code.
 */
export async function createShopifyRedirect(
  shopSubdomain: string,
  accessToken: string,
  sourcePath: string,
  targetPath: string,
): Promise<ShopifyRedirect> {
  const source = validatePath(sourcePath, "Source path");
  const target = validatePath(targetPath, "Target path");
  if (source === target) throw new Error("Source and target paths must be different.");
  const result = await shopifyGraphQL<ShopifyGraphQLResponse>(shopSubdomain, accessToken, URL_REDIRECT_CREATE, { urlRedirect: { path: source, target } });

  const payload = result.data?.urlRedirectCreate;
  if (!payload) throw new Error("Shopify did not return a URL redirect result.");
  if (payload.userErrors.length) throw new Error(payload.userErrors.map(error => error.message).join("; ").slice(0, 1000));
  if (!payload.urlRedirect) throw new Error("Shopify did not create the URL redirect.");
  return payload.urlRedirect;
}
