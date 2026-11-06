import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { normalizeDashboardDomain } from "@/lib/audit-dashboard";
import { generateWorkspaceApiKey } from "@/lib/integrations-workflow";
import { readRequestJson } from "@/lib/read-request-json";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  const { userId } = await auth(); if (!userId) return json({ error: "Sign in to manage API keys." }, 401);
  const domainInput = new URL(request.url).searchParams.get("domain"); let domain: string; try { domain = normalizeDashboardDomain(domainInput ?? ""); } catch { return json({ error: "Provide a valid domain." }, 400); }
  const db = createServerDatabase(); const owner = await db.from("audits").select("id").eq("user_id", userId).eq("domain", domain).limit(1);
  if (owner.error) return json({ error: "Workspace lookup is unavailable." }, 503); if (!owner.data?.length) return json({ error: "Workspace not found." }, 404);
  const result = await db.from("workspace_api_keys").select("id,workspace_domain,key_prefix,permissions_json,rate_limit_per_minute,last_used_at,created_at,revoked_at").eq("user_id", userId).eq("workspace_domain", domain).order("created_at", { ascending: false }).limit(100);
  return result.error ? json({ error: "API key list is unavailable." }, 503) : json({ keys: result.data ?? [] });
}

export async function POST(request: Request) {
  const { userId } = await auth(); if (!userId) return json({ error: "Sign in to create an API key." }, 401);
  const parsed = await readRequestJson(request, 4096); if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object") return json({ error: "Provide a domain and optional permissions." }, 400);
  const input = parsed.value as Record<string, unknown>; let domain: string; try { domain = normalizeDashboardDomain(typeof input.domain === "string" ? input.domain : ""); } catch { return json({ error: "Provide a valid domain." }, 400); }
  const allowed = ["audit:read", "evidence:read", "recovery:read", "recovery:propose"];
  const permissions = input.permissions ?? ["audit:read"];
  if (!Array.isArray(permissions) || !permissions.length || permissions.some(permission => typeof permission !== "string" || !allowed.includes(permission))) return json({ error: "API permissions must be selected from the supported read scopes." }, 400);
  const db = createServerDatabase(); const owner = await db.from("audits").select("id").eq("user_id", userId).eq("domain", domain).limit(1);
  if (owner.error) return json({ error: "Workspace lookup is unavailable." }, 503); if (!owner.data?.length) return json({ error: "Workspace not found." }, 404);
  const generated = generateWorkspaceApiKey(); const saved = await db.from("workspace_api_keys").insert({ user_id: userId, workspace_domain: domain, key_hash: generated.hash, key_prefix: generated.prefix, permissions_json: permissions as string[], rate_limit_per_minute: 60 }).select("id,key_prefix,permissions_json,rate_limit_per_minute,created_at").single();
  if (saved.error || !saved.data) return json({ error: "API key could not be created." }, 503);
  return json({ key: generated.key, record: saved.data }, 201);
}

export async function DELETE(request: Request) {
  const { userId } = await auth(); if (!userId) return json({ error: "Sign in to revoke an API key." }, 401);
  const parsed = await readRequestJson(request, 4096); if (parsed.kind !== "ok" || !parsed.value || typeof parsed.value !== "object") return json({ error: "Provide an API key ID." }, 400);
  const { id } = parsed.value as Record<string, unknown>; if (typeof id !== "string") return json({ error: "Provide an API key ID." }, 400);
  const result = await createServerDatabase().from("workspace_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).is("revoked_at", null).select("id").maybeSingle();
  return result.error ? json({ error: "API key could not be revoked." }, 503) : result.data ? json({ revoked: true }) : json({ error: "API key not found." }, 404);
}
