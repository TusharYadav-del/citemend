import "server-only";

import { decryptShopifyAccessToken } from "../shopify";

const API_VERSION = "2026-10";
const CREATE = `#graphql
  mutation UrlRedirectCreate($urlRedirect: UrlRedirectInput!) {
    urlRedirectCreate(urlRedirect: $urlRedirect) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }
`;
const UPDATE = `#graphql
  mutation UrlRedirectUpdate($id: ID!, $urlRedirect: UrlRedirectInput!) {
    urlRedirectUpdate(id: $id, urlRedirect: $urlRedirect) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }
`;
const FIND_BY_PATH = `#graphql
  query UrlRedirectByPath($query: String!) {
    urlRedirects(first: 1, query: $query) { nodes { id path target } }
  }
`;

export type ShopifyUrlRedirect = { id: string; path: string; target: string };
type GraphQLPayload<T> = { data?: T; errors?: { message?: string }[] };
type MutationPayload = { urlRedirect: ShopifyUrlRedirect | null; userErrors: { field: string[] | null; message: string }[] };

function validateStore(store: string) {
  const value = store.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/.test(value)) throw new Error("Shopify shop must be a myshopify.com subdomain.");
  return value;
}

function validateLocalPath(path: string, label: string) {
  if (typeof path !== "string" || path.length < 2 || path.length > 2048 || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f\u007f#]/.test(path)) {
    throw new Error(`${label} must be a local path beginning with a single slash.`);
  }
  return path;
}

async function request<T>(store: string, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const shop = validateStore(store);
  if (typeof token !== "string" || token.length < 8 || token.length > 4096 || /\s/.test(token)) throw new Error("Provide a valid Shopify Admin API token.");
  const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  let result: GraphQLPayload<T>;
  try { result = await response.json() as GraphQLPayload<T>; }
  catch { throw new Error(`Shopify returned an invalid GraphQL response (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(`Shopify Admin API request failed (HTTP ${response.status}).`);
  if (result.errors?.length) throw new Error(result.errors.map(item => item.message).filter(Boolean).join("; ").slice(0, 1000) || "Shopify GraphQL request failed.");
  if (!result.data) throw new Error("Shopify did not return GraphQL data.");
  return result.data;
}

function checkMutation(payload: MutationPayload | undefined): ShopifyUrlRedirect {
  if (!payload) throw new Error("Shopify did not return a URL redirect result.");
  if (payload.userErrors?.length) throw new Error(payload.userErrors.map(item => item.message).join("; ").slice(0, 1000));
  if (!payload.urlRedirect?.id || !payload.urlRedirect.path || !payload.urlRedirect.target) throw new Error("Shopify did not confirm the requested redirect.");
  return payload.urlRedirect;
}

export async function createShopifyUrlRedirect(store: string, token: string, path: string, target: string): Promise<ShopifyUrlRedirect> {
  const source = validateLocalPath(path, "Source path");
  const destination = validateLocalPath(target, "Target path");
  if (source === destination) throw new Error("Source and target paths must be different.");
  const data = await request<{ urlRedirectCreate?: MutationPayload }>(store, token, CREATE, { urlRedirect: { path: source, target: destination } });
  return checkMutation(data.urlRedirectCreate);
}

export async function updateShopifyUrlRedirect(store: string, token: string, id: string, path: string, target: string): Promise<ShopifyUrlRedirect> {
  const source = validateLocalPath(path, "Source path");
  const destination = validateLocalPath(target, "Target path");
  if (!/^gid:\/\/shopify\/UrlRedirect\/[A-Za-z0-9]+$/.test(id)) throw new Error("Shopify URL redirect ID is invalid.");
  if (source === destination) throw new Error("Source and target paths must be different.");
  const data = await request<{ urlRedirectUpdate?: MutationPayload }>(store, token, UPDATE, { id, urlRedirect: { path: source, target: destination } });
  return checkMutation(data.urlRedirectUpdate);
}

/** Create the rule, or update a pre-existing same-path rule when Shopify reports a duplicate. */
export async function deployShopifyUrlRedirect(store: string, token: string, path: string, target: string): Promise<ShopifyUrlRedirect> {
  try { return await createShopifyUrlRedirect(store, token, path, target); }
  catch (error) {
    if (!(error instanceof Error) || !/already exists|already taken|path.*(taken|exists)|duplicate/i.test(error.message)) throw error;
    const query = `path:${JSON.stringify(path)}`;
    const found = await request<{ urlRedirects?: { nodes?: ShopifyUrlRedirect[] } }>(store, token, FIND_BY_PATH, { query });
    const existing = found.urlRedirects?.nodes?.find(item => item.path === path);
    if (!existing) throw error;
    return updateShopifyUrlRedirect(store, token, existing.id, path, target);
  }
}

export function decryptConnectedShopifyToken(encryptedToken: string): string {
  return decryptShopifyAccessToken(encryptedToken);
}
