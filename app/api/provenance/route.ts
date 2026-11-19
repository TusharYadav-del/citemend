import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { buildRetrievalConsistency, summarizeProvenanceEvents, type ProvenanceEvent, type ProvenanceObservation } from "@/lib/provenance-analytics";
import { stableJourneyHash, stableOrderReferenceHash, validProvenanceTimestamp, validateProvenanceEvent, verifyProvenanceSignature, type ProvenanceEventInput, type ProvenanceSource } from "@/lib/provenance-log-events";

const MAX_BODY_BYTES = 64 * 1024;
const SOURCES: ProvenanceSource[] = ["cloudflare_logpush", "shopify_webhook", "server_log"];
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

async function readBoundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function POST(request: Request) {
  const secret = process.env.PROVENANCE_LOG_INGEST_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "Log ingestion is not configured." }, { status: 503 });
  const rawBody = await readBoundedBody(request);
  if (rawBody === null) return Response.json({ error: "Batch exceeds the 64 KiB limit." }, { status: 413 });
  const timestamp = request.headers.get("x-citemend-timestamp") ?? "";
  const signature = (request.headers.get("x-citemend-signature") ?? "").replace(/^sha256=/i, "");
  if (!verifyProvenanceSignature(rawBody, timestamp, signature, secret)) return Response.json({ error: "Valid signed ingestion headers are required." }, { status: 401 });
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Expected a domain, source, and event batch." }, { status: 400 });
  const input = body as { domain?: unknown; source?: unknown; events?: unknown };
  const domain = typeof input.domain === "string" ? input.domain.trim().toLowerCase().replace(/^www\./, "") : "";
  if (!DOMAIN_PATTERN.test(domain) || !SOURCES.includes(input.source as ProvenanceSource) || !Array.isArray(input.events) || input.events.length < 1 || input.events.length > 100) return Response.json({ error: "Provide a valid workspace domain, source, and 1–100 events." }, { status: 400 });

  try {
    const db = createServerDatabase();
    const audit = await db.from("audits").select("user_id").eq("domain", domain).order("created_at", { ascending: false }).limit(100);
    const ownerIds = [...new Set((audit.data ?? []).map(row => row.user_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
    if (audit.error || !ownerIds.length) return Response.json({ error: "Workspace domain was not found." }, { status: 404 });
    if (ownerIds.length !== 1) return Response.json({ error: "This domain belongs to more than one workspace; configure a workspace-specific ingestion route." }, { status: 409 });
    const source = input.source as ProvenanceSource;
    const rows = [];
    let rejected = 0;
    for (const value of input.events) {
      if (!value || typeof value !== "object") { rejected++; continue; }
      const event = value as ProvenanceEventInput;
      const normalized = validateProvenanceEvent(event, domain, source);
      const occurredAt = validProvenanceTimestamp(event.occurredAt);
      if (!normalized || !occurredAt) { rejected++; continue; }
      rows.push({ user_id: ownerIds[0], workspace_domain: domain, source_kind: source, ...normalized, journey_hash: stableJourneyHash(event.sessionId, secret), order_ref_hash: normalized.event_type === "shopify_order" ? stableOrderReferenceHash(event.orderId, secret) : null, occurred_at: occurredAt });
    }
    if (rows.length) {
      const inserted = await db.from("ai_provenance_events").insert(rows);
      if (inserted.error) return Response.json({ error: "Could not persist provenance events." }, { status: 503 });
    }
    return Response.json({ received: input.events.length, saved: rows.length, rejected }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Provenance ingestion is temporarily unavailable." }, { status: 503 }); }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session.userId) return Response.json({ error: "Sign in to view provenance analytics." }, { status: 401 });
  const domain = new URL(request.url).searchParams.get("domain")?.trim().toLowerCase().replace(/^www\./, "") ?? "";
  if (!DOMAIN_PATTERN.test(domain)) return Response.json({ error: "Provide a valid workspace domain." }, { status: 400 });
  try {
    const db = createServerDatabase();
    const access = await resolveWorkspaceAccess(db, session.userId, session.orgId ?? null, session.orgRole ?? null);
    const audits = await db.from("audits").select("id,user_id").eq("domain", domain).in("user_id", access.ownerUserIds).order("created_at", { ascending: false }).limit(100);
    if (audits.error || !audits.data?.length) return Response.json({ error: "Workspace domain was not found." }, { status: 404 });
    const auditIds = audits.data.map(row => row.id);
    const ownerIds = [...new Set(audits.data.map(row => row.user_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
    const eventCutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [observations, events] = await Promise.all([
      db.from("ai_observation_evidence").select("prompt_query,provider,model_name,retrieved_urls_json,rendered_urls_json,extracted_urls_json,raw_answer,observed_at,sample_size").eq("domain", domain).in("audit_id", auditIds).order("observed_at", { ascending: false }).limit(500),
      db.from("ai_provenance_events").select("event_type,crawler_name,crawler_verified,referral_host,journey_hash,occurred_at").in("user_id", ownerIds).eq("workspace_domain", domain).gte("occurred_at", eventCutoff).order("occurred_at", { ascending: false }).limit(1000),
    ]);
    if (observations.error || events.error) return Response.json({ error: "Provenance analytics are not available yet. Apply the latest database migration." }, { status: 503 });
    const retrievalConsistency = buildRetrievalConsistency((observations.data ?? []) as ProvenanceObservation[], domain);
    const eventRows = (events.data ?? []) as ProvenanceEvent[];
    return Response.json({ retrievalConsistency, events: summarizeProvenanceEvents(eventRows), eventSampleCount: eventRows.length, eventWindowDays: 30 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Provenance analytics are temporarily unavailable." }, { status: 503 }); }
}
