import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServerDatabase } from "@/lib/supabase-server";

export async function authenticatePublicApi(request: Request, permission: string) {
  const match = /^Bearer (cm_live_[A-Za-z0-9_-]{32,})$/.exec(request.headers.get("authorization") ?? "");
  if (!match) return { error: "A valid Bearer API key is required.", status: 401 } as const;
  const hash = createHash("sha256").update(match[1]).digest("hex"); const db = createServerDatabase();
  const key = await db.from("workspace_api_keys").select("id,user_id,workspace_domain,key_hash,permissions_json,rate_limit_per_minute").eq("key_hash", hash).is("revoked_at", null).maybeSingle();
  if (key.error || !key.data) return { error: "Invalid API key.", status: 401 } as const;
  const expected = Buffer.from(key.data.key_hash, "hex"), actual = Buffer.from(hash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual) || !key.data.permissions_json.includes(permission)) return { error: "API key lacks the required scope.", status: 403 } as const;
  const policy = await db.from("workspace_governance_policies").select("api_rate_limit_per_minute").eq("user_id", key.data.user_id).eq("workspace_domain", key.data.workspace_domain).maybeSingle();
  const limit = Math.max(1, Math.min(600, policy.data?.api_rate_limit_per_minute ?? key.data.rate_limit_per_minute));
  const used = await db.rpc("consume_workspace_api_rate_limit", { p_key_id: key.data.id, p_limit: limit });
  if (used.error || used.data !== true) return { error: "API rate limit exceeded.", status: used.error ? 503 : 429 } as const;
  void db.from("workspace_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.data.id);
  return { db, userId: key.data.user_id, domain: key.data.workspace_domain } as const;
}
