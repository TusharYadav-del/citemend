import "server-only";
import { createServerDatabase } from "./supabase-server";
import { readAgencyProfile, type AgencyProfile } from "./agency-whitelabel";

const fields = "agency_brand_name,agency_logo_url,agency_primary_color,agency_cta_text,agency_cta_url";

export async function getAgencyProfile(userId: string, domain: string): Promise<AgencyProfile | null> {
  const { data, error } = await createServerDatabase().from("workspace_integrations").select(fields).eq("user_id", userId).eq("domain", domain).maybeSingle();
  if (error) throw error;
  return data ? readAgencyProfile(data) : null;
}

export async function saveAgencyProfile(userId: string, domain: string, profile: AgencyProfile): Promise<void> {
  const db = createServerDatabase();
  const existing = await db.from("workspace_integrations").select("id").eq("user_id", userId).eq("domain", domain).maybeSingle();
  if (existing.error) throw existing.error;
  const updated = existing.data
    ? await db.from("workspace_integrations").update({ ...profile, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("domain", domain)
    : await db.from("workspace_integrations").insert({ user_id: userId, domain, ...profile });
  if (updated.error) {
    if (!existing.data && updated.error.code === "23505") {
      const retry = await db.from("workspace_integrations").update({ ...profile, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("domain", domain);
      if (!retry.error) return;
    }
    throw updated.error;
  }
}

/** The caller must have verified paid access for this audit. */
export async function stampAgencyProfile(userId: string, domain: string, auditId: string): Promise<void> {
  const profile = await getAgencyProfile(userId, domain);
  if (!profile) return;
  const { error } = await createServerDatabase().from("audits").update(profile).eq("id", auditId).eq("user_id", userId).eq("domain", domain);
  if (error) throw error;
}
