import "server-only";
import { randomUUID } from "node:crypto";
import { CitationProviderError } from "./citation-probe";
import { AuditInputError, runAudit, validateAuditInput } from "./audit-pipeline";
import { AuditStorageError, persistAudit } from "./audit-store";
import { hasProSubscription } from "./subscription";
import { reserveFreeAudit, releaseFreeAudit } from "./free-audit";
import { stampAgencyProfile } from "./agency-store";
import { getAuditQuota } from "./audit-quota";
import { createServerDatabase } from "./supabase-server";
import { ensureWorkspaceOperatingBaseline } from "./operating-metrics";
import { enqueueBackgroundJob, normalizeIdempotencyKey } from "./job-queue";

type AuditPostDependencies = {
  isConfigured?: () => boolean;
  getUserId?: () => Promise<string | null>;
  execute?: typeof runAudit;
  hasPro?: typeof hasProSubscription;
  reserveFree?: typeof reserveFreeAudit;
  releaseFree?: typeof releaseFreeAudit;
};

export function createAuditPostHandler(dependencies: AuditPostDependencies = {}) {
  const isConfigured = dependencies.isConfigured ?? (() => Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  ));
  const getUserId = dependencies.getUserId ?? (async () => {
    const { auth } = await import("@clerk/nextjs/server");
    return (await auth()).userId;
  });
  const execute = dependencies.execute ?? runAudit;
  const hasPro = dependencies.hasPro ?? hasProSubscription;
  const reserveFree = dependencies.reserveFree ?? reserveFreeAudit;
  const releaseFree = dependencies.releaseFree ?? releaseFreeAudit;

  return async function handleAuditPost(request: Request): Promise<Response> {
    if (!isConfigured()) {
      return Response.json({ error: "Audit sign-in is not configured. Add the Clerk keys to the server environment." }, { status: 503 });
    }

    let userId: string | null;
    try { userId = await getUserId(); }
    catch { return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503 }); }
    if (!userId) return Response.json({ error: "Sign in to run an audit." }, { status: 401 });
    const contentType = request.headers.get("content-type") ?? "";
    const mediaType = contentType.split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
      return Response.json({ error: "Use Content-Type: application/json." }, { status: 415 });
    }

    let input: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) return Response.json({ error: "JSON body is required." }, { status: 400 });
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 16_384) {
            await reader.cancel().catch(() => {});
            return Response.json({ error: "Request body exceeds 16 KiB." }, { status: 413 });
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

    let normalizedInput: ReturnType<typeof validateAuditInput>;
    try { normalizedInput = validateAuditInput(input); }
    catch (error) {
      return Response.json({ error: error instanceof AuditInputError ? error.message : "Invalid audit input." }, { status: 400 });
    }
    const domain = normalizedInput.domain;
    const buyerPromptCount = normalizedInput.buyerPrompts?.length ?? 1;
    let queueKey: string | null = null;
    if (buyerPromptCount > 1) {
      try { queueKey = normalizeIdempotencyKey(request.headers.get("idempotency-key"), randomUUID()); }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid idempotency key." }, { status: 400 }); }
      if (request.headers.has("idempotency-key")) {
        try {
          const existing = await createServerDatabase().from("background_jobs").select("id,status,progress_percent,current_step_label")
            .eq("user_id", userId).eq("workspace_domain", domain).eq("job_key", queueKey).maybeSingle();
          if (existing.data) return Response.json({ jobId: existing.data.id, status: existing.data.status, progressPercent: existing.data.progress_percent, currentStepLabel: existing.data.current_step_label }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
        } catch { /* The enqueue below returns the controlled storage error if the queue is not installed. */ }
      }
    }

    let isPro: boolean;
    try { isPro = await hasPro(userId); }
    catch { return Response.json({ error: "Subscription status is temporarily unavailable." }, { status: 503 }); }

    let quota: Awaited<ReturnType<typeof getAuditQuota>> | null = null;
    if (!dependencies.hasPro) {
      try { quota = await getAuditQuota(userId, buyerPromptCount); }
      catch { return Response.json({ error: "Tier usage is temporarily unavailable. Apply the current evidence and quota migration, then retry." }, { status: 503 }); }
      if (!quota.allowed) return Response.json({ error: `This audit would exceed the ${quota.tier.replaceAll("_", " ")} ${quota.reason.replaceAll("_", " ")} quota.`, code: "TIER_QUOTA_EXCEEDED", tier: quota.tier, quota: quota.reason }, { status: 429 });
    }

    let reservation: { id: string; createdAt: string } | undefined;
    if (!isPro) {
      if (process.env.AUDIT_PERSISTENCE_MODE === "local") {
        return Response.json({ error: "Free audits require database persistence." }, { status: 503 });
      }
      let result: Awaited<ReturnType<typeof reserveFreeAudit>>;
      try { result = await reserveFree(userId, domain); }
      catch { return Response.json({ error: "Audit allowance is temporarily unavailable." }, { status: 503 }); }
      if (result.kind === "limit") {
        return Response.json({ error: "Your free audit has been used. Upgrade to Pro for unlimited audits.", code: "PRO_REQUIRED" }, { status: 403 });
      }
      if (result.kind === "busy") {
        return Response.json({ error: "A free audit is already running. Please wait before trying again.", code: "AUDIT_IN_PROGRESS" }, { status: 429 });
      }
      reservation = { id: result.id, createdAt: result.createdAt };
    }

    const auditStartedAt = new Date().toISOString();
    try { await ensureWorkspaceOperatingBaseline(createServerDatabase(), userId, domain, auditStartedAt); }
    catch { /* Metrics telemetry must never block a valid audit. */ }

    if (buyerPromptCount > 1 && queueKey) {
      try {
        const job = await enqueueBackgroundJob(createServerDatabase(), {
          userId, domain, type: "audit_scan", key: queueKey,
          payload: { input: normalizedInput, reservation: reservation ?? null, auditStartedAt, sitemapPageLimit: quota?.maxSitemapPages ?? null, isPro },
        });
        const queuedReservation = job.payload_json.reservation && typeof job.payload_json.reservation === "object"
          ? job.payload_json.reservation as { id?: unknown } : null;
        if (reservation && queuedReservation?.id !== reservation.id) await releaseFree(userId, reservation.id, reservation.createdAt).catch(() => {});
        return Response.json({ jobId: job.id, status: job.status, progressPercent: job.progress_percent, currentStepLabel: job.current_step_label }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
      } catch (error) {
        if (reservation) await releaseFree(userId, reservation.id, reservation.createdAt).catch(() => {});
        if (error instanceof Error && /queue is full|rate limit reached/i.test(error.message)) return Response.json({ error: error.message }, { status: 429 });
        return Response.json({ error: "The background scan queue is unavailable. Apply the background jobs migration and retry." }, { status: 503 });
      }
    }

    try {
      const report = await execute(normalizedInput, { ...(quota ? { sitemapPageLimit: quota.maxSitemapPages } : {}), save: (value, owner) => persistAudit(value, owner, reservation, undefined, auditStartedAt) }, userId);
      let enrichmentJobId: string | null = null;
      if (report.persistence.status === "saved" && report.auditId) {
        if (isPro) {
          try { await stampAgencyProfile(userId, report.domain, report.auditId); }
          catch { report.warnings?.push("White-label settings could not be applied to this saved audit."); }
        }
        try {
          const job = await enqueueBackgroundJob(createServerDatabase(), {
            userId, domain: report.domain, type: "audit_enrichment", key: `enrichment:${report.auditId}`,
            payload: { auditId: report.auditId, domain: report.domain, buyerPrompt: report.buyerPrompt,
              buyerPrompts: report.buyerPrompts ?? [report.buyerPrompt], competitorDomains: report.competitorDomains ?? [],
              extractedUrls: report.extractedUrls, providerUsed: report.providerUsed ?? "unknown", generatedText: report.generatedText },
          });
          enrichmentJobId = job.id;
        } catch { report.warnings?.push("The audit is saved; background competitor enrichment could not be queued."); }
      }
      return Response.json({
        ...report,
        ...(enrichmentJobId ? { enrichmentJobId, enrichmentStatus: "queued" } : {}),
      }, { status: report.persistence.status === "saved" ? 201 : 200 });
    } catch (error) {
      if (error instanceof AuditInputError) return Response.json({ error: error.message }, { status: 400 });
      if (error instanceof AuditStorageError) return Response.json({ error: error.message, stage: "persistence" }, { status: 502 });
      if (error instanceof CitationProviderError) return Response.json({ error: error.message, stage: "probe", provider: "groq", upstreamStatus: error.upstreamStatus }, { status: error.upstreamStatus === 429 ? 429 : 502 });
      return Response.json({ error: "The audit could not complete. Check server configuration and provider availability.", stage: "pipeline" }, { status: 502 });
    } finally {
      if (reservation) await releaseFree(userId, reservation.id, reservation.createdAt).catch(() => {});
    }
  };
}
