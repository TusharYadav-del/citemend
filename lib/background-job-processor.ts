import "server-only";
import { runAudit } from "./audit-pipeline";
import { runCitationProbe, type CitationProbeResult } from "./citation-probe";
import { synthesizeEngineProfiles } from "./engine-synthesis";
import { AuditStorageError, persistAudit } from "./audit-store";
import { CitationProviderError } from "./citation-probe";
import { releaseFreeAudit } from "./free-audit";
import { stampAgencyProfile } from "./agency-store";
import { findCompetitor404Opportunities } from "./hijacker";
import { inspectThirdPartyCitations } from "./listicle-crawler";
import { detectEntityPricingTruth } from "./entity-truth";
import { createServerDatabase } from "./supabase-server";
import { enqueueBackgroundJob, advanceBackgroundJob, completeBackgroundJob, reportBackgroundJobProgress, retryBackgroundJob, type BackgroundJobRow } from "./job-queue";
import { processEcommerceSyncChunk } from "./ecommerce-sync-worker";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeFailure(error: unknown) {
  if (error instanceof CitationProviderError && error.upstreamStatus === 429) return "AI provider rate limit reached; the job will retry with backoff.";
  if (error instanceof AuditStorageError) return "The audit could not be saved and verified.";
  if (error instanceof Error && /shopify connection|connect shopify/i.test(error.message)) return "The Shopify connection needs attention.";
  return "A background step failed. The job will retry automatically when attempts remain.";
}

async function auditScan(db: ReturnType<typeof createServerDatabase>, job: BackgroundJobRow) {
  const payload = job.payload_json;
  const input = asObject(payload.input);
  const domain = String(input.domain ?? "");
  if (!domain || domain !== job.workspace_domain) throw new Error("Queued audit workspace did not match its job scope.");
  const prompts = Array.isArray(input.buyerPrompts) ? input.buyerPrompts.filter((item): item is string => typeof item === "string")
    : typeof input.buyerPrompt === "string" ? [input.buyerPrompt] : [];
  if (!prompts.length || prompts.length > 5) throw new Error("Queued audit prompt set is invalid.");
  const savedProbes = Array.isArray(payload.probeResults) ? payload.probeResults as CitationProbeResult[] : [];
  if (savedProbes.length > prompts.length || savedProbes.some(item => !item || typeof item.text !== "string" || !Array.isArray(item.citedUrls) || !Array.isArray(item.warnings) || !item.searchGrounding || !Array.isArray(item.searchGrounding.sources))) throw new Error("Saved background prompt evidence is invalid.");
  if (savedProbes.length < prompts.length) {
    const nextIndex = savedProbes.length;
    const nextProbe = await runCitationProbe(domain, prompts[nextIndex]);
    if (Buffer.byteLength(JSON.stringify(nextProbe), "utf8") > 150_000) throw new Error("Buyer prompt response exceeded its queue checkpoint limit.");
    await advanceBackgroundJob(db, job, { ...payload, probeResults: [...savedProbes, nextProbe] },
      Math.round((nextIndex + 1) / prompts.length * 65), `Collected buyer prompt ${nextIndex + 1} of ${prompts.length}`);
    return { continued: true as const };
  }
  const reservationRaw = asObject(payload.reservation);
  const reservation = typeof reservationRaw.id === "string" && typeof reservationRaw.createdAt === "string"
    ? { id: reservationRaw.id, createdAt: reservationRaw.createdAt } : undefined;
  const auditStartedAt = typeof payload.auditStartedAt === "string" ? payload.auditStartedAt : job.created_at;
  let report;
  try {
    report = await runAudit(input, {
      sitemapPageLimit: typeof payload.sitemapPageLimit === "number" ? payload.sitemapPageLimit : undefined,
      onProgress: (progress, label) => reportBackgroundJobProgress(db, job, 70 + Math.round(progress * 0.29), label),
      probe: async () => savedProbes.shift()!,
      synthesize: synthesizeEngineProfiles,
      save: (value, owner) => persistAudit(value, owner, reservation, reservation ? undefined : job.id, auditStartedAt, true),
    }, job.user_id);
  } finally {
    if (reservation) await releaseFreeAudit(job.user_id, reservation.id, reservation.createdAt).catch(() => {});
  }
  if (report.persistence.status !== "saved" || !report.auditId) throw new AuditStorageError("Queued audit was not saved.");
  if (payload.isPro === true) await stampAgencyProfile(job.user_id, domain, report.auditId).catch(() => {});
  const enrichment = await enqueueBackgroundJob(db, {
    userId: job.user_id, domain, type: "audit_enrichment", key: `enrichment:${report.auditId}`,
    payload: { auditId: report.auditId, domain, buyerPrompt: report.buyerPrompt,
      buyerPrompts: report.buyerPrompts ?? [report.buyerPrompt], competitorDomains: report.competitorDomains ?? [],
      extractedUrls: report.extractedUrls, providerUsed: report.providerUsed ?? "unknown", generatedText: report.generatedText },
  });
  return { continued: false as const, report, enrichmentJobId: enrichment.id };
}

async function auditEnrichment(db: ReturnType<typeof createServerDatabase>, job: BackgroundJobRow) {
  const payload = job.payload_json;
  const auditId = String(payload.auditId ?? "");
  const domain = String(payload.domain ?? "");
  const prompts = Array.isArray(payload.buyerPrompts) ? payload.buyerPrompts.filter((item): item is string => typeof item === "string") : [];
  const buyerPrompt = typeof payload.buyerPrompt === "string" ? payload.buyerPrompt : prompts[0] ?? "";
  const competitorDomains = Array.isArray(payload.competitorDomains) ? payload.competitorDomains.filter((item): item is string => typeof item === "string") : [];
  const extractedUrls = Array.isArray(payload.extractedUrls) ? payload.extractedUrls.filter((item): item is string => typeof item === "string") : [];
  const providerUsed = typeof payload.providerUsed === "string" ? payload.providerUsed : "unknown";
  const generatedText = typeof payload.generatedText === "string" ? payload.generatedText : "";
  if (!auditId || domain !== job.workspace_domain) throw new Error("Queued audit enrichment workspace is invalid.");
  await reportBackgroundJobProgress(db, job, 15, "Checking competitor citation opportunities");
  const hijack = await findCompetitor404Opportunities({ auditId, domain, competitorDomains, citationUrls: extractedUrls, prompt: prompts.join("\n") || buyerPrompt, citedEngine: providerUsed.startsWith("groq-") ? "Groq+Tavily" : providerUsed, responseText: generatedText });
  const thirdPartyUrls = hijack.classifications.filter(item => item.bucket === "third_party_source").map(item => item.url);
  if (thirdPartyUrls.length) {
    await enqueueBackgroundJob(db, {
      userId: job.user_id, domain, type: "listicle_crawl", key: `listicle:${auditId}`,
      payload: { auditId, domain, competitorDomains, thirdPartyUrls, prompt: prompts.join("\n") || buyerPrompt, citedEngine: providerUsed.startsWith("groq-") ? "Groq+Tavily" : providerUsed },
    });
  }
  const entityPrompt = prompts.find(prompt => /(price|pricing|cost|plan|tier|free|feature|compare|comparison|alternative)/i.test(prompt)) ?? buyerPrompt;
  await reportBackgroundJobProgress(db, job, 65, "Comparing saved answers with public product facts");
  await detectEntityPricingTruth({ auditId, domain, prompt: entityPrompt, answer: generatedText }).catch(() => null);
  return { auditId, competitorOpportunities: hijack.opportunities.length, thirdPartySourcesQueued: thirdPartyUrls.length, entityTruthAnalyzed: !!entityPrompt, warning: hijack.warning ?? null };
}

async function listicleCrawl(job: BackgroundJobRow) {
  const payload = job.payload_json;
  const thirdPartyUrls = Array.isArray(payload.thirdPartyUrls) ? payload.thirdPartyUrls.filter((item): item is string => typeof item === "string") : [];
  const result = await inspectThirdPartyCitations({
    auditId: String(payload.auditId ?? ""), domain: job.workspace_domain,
    competitorDomains: Array.isArray(payload.competitorDomains) ? payload.competitorDomains.filter((item): item is string => typeof item === "string") : [],
    thirdPartyUrls, prompt: typeof payload.prompt === "string" ? payload.prompt : "",
    citedEngine: typeof payload.citedEngine === "string" ? payload.citedEngine : "unknown",
  });
  return { auditId: String(payload.auditId ?? ""), opportunityCount: result.opportunities.length, warning: result.warning ?? null };
}

export async function processNextBackgroundJob() {
  const db = createServerDatabase();
  const { claimBackgroundJob } = await import("./job-queue");
  const job = await claimBackgroundJob(db, 300);
  if (!job) return { status: "idle" as const };
  try {
    if (!job.lease_token) throw new Error("The job lease is missing.");
    if (job.job_type === "ecommerce_sync") {
      const chunk = await processEcommerceSyncChunk(db, job);
      if (chunk.done) await completeBackgroundJob(db, job, chunk.result ?? {});
      else await advanceBackgroundJob(db, job, chunk.payload, chunk.progress, chunk.label);
    } else if (job.job_type === "audit_scan") {
      const timer = setInterval(() => { void reportBackgroundJobProgress(db, job, 25, "Running buyer prompt and citation checks").catch(() => {}); }, 60_000);
      try {
        const result = await auditScan(db, job);
        if (result.continued) return { status: "continued" as const, jobId: job.id, jobType: job.job_type };
        await completeBackgroundJob(db, job, { report: result.report as unknown as Record<string, unknown>, enrichmentJobId: result.enrichmentJobId });
      } finally { clearInterval(timer); }
    } else if (job.job_type === "audit_enrichment") {
      const result = await auditEnrichment(db, job);
      await completeBackgroundJob(db, job, result);
    } else if (job.job_type === "listicle_crawl") {
      const result = await listicleCrawl(job);
      await completeBackgroundJob(db, job, result);
    } else throw new Error("Unsupported background job type.");
    return { status: "processed" as const, jobId: job.id, jobType: job.job_type };
  } catch (error) {
    const status = await retryBackgroundJob(db, job, safeFailure(error));
    return { status: status === "failed" ? "failed" as const : "retrying" as const, jobId: job.id, jobType: job.job_type };
  }
}
