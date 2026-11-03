import "server-only";
import { CitationProviderError } from "./citation-probe";
import { AuditInputError, runAudit, validateAuditInput } from "./audit-pipeline";
import { AuditStorageError, persistAudit } from "./audit-store";
import { hasProSubscription } from "./subscription";
import { reserveFreeAudit, releaseFreeAudit } from "./free-audit";
import { findCompetitor404Opportunities } from "./hijacker";
import { inspectThirdPartyCitations } from "./listicle-crawler";

type AuditPostDependencies = {
  isConfigured?: () => boolean;
  getUserId?: () => Promise<string | null>;
  execute?: typeof runAudit;
  hasPro?: typeof hasProSubscription;
  reserveFree?: typeof reserveFreeAudit;
  releaseFree?: typeof releaseFreeAudit;
  hijack?: typeof findCompetitor404Opportunities;
  crawlListicles?: typeof inspectThirdPartyCitations;
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
  const hijack = dependencies.hijack ?? findCompetitor404Opportunities;
  const crawlListicles = dependencies.crawlListicles ?? inspectThirdPartyCitations;

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

    let domain: string;
    try { domain = validateAuditInput(input).domain; }
    catch (error) {
      return Response.json({ error: error instanceof AuditInputError ? error.message : "Invalid audit input." }, { status: 400 });
    }

    let isPro: boolean;
    try { isPro = await hasPro(userId); }
    catch { return Response.json({ error: "Subscription status is temporarily unavailable." }, { status: 503 }); }

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

    try {
      const report = await execute(input, reservation
        ? { save: (value, owner) => persistAudit(value, owner, reservation) }
        : {}, userId);
      let hijackResult: Awaited<ReturnType<typeof findCompetitor404Opportunities>> | null = null;
      let listicleResult: Awaited<ReturnType<typeof inspectThirdPartyCitations>> | null = null;
      if (report.persistence.status === "saved" && report.auditId) {
        try {
          hijackResult = await hijack({
            auditId: report.auditId, domain: report.domain, competitorDomains: report.competitorDomains ?? [],
            citationUrls: report.extractedUrls, prompt: (report.buyerPrompts ?? [report.buyerPrompt]).join("\n"),
            citedEngine: report.providerUsed?.startsWith("groq-") ? "Groq+Tavily" : report.providerUsed ?? "unknown",
            responseText: report.generatedText,
          });
          if (hijackResult.warning) report.warnings.push(hijackResult.warning);
        } catch {
          report.warnings.push("Competitor citation analysis was temporarily unavailable.");
        }
        if (hijackResult) {
          try {
            listicleResult = await crawlListicles({
              auditId: report.auditId, domain: report.domain, competitorDomains: report.competitorDomains ?? [],
              thirdPartyUrls: hijackResult.classifications.filter(item => item.bucket === "third_party_source").map(item => item.url),
              prompt: (report.buyerPrompts ?? [report.buyerPrompt]).join("\n"),
              citedEngine: report.providerUsed?.startsWith("groq-") ? "Groq+Tavily" : report.providerUsed ?? "unknown",
            });
            if (listicleResult.warning) report.warnings.push(listicleResult.warning);
          } catch {
            report.warnings.push("Listicle and Reddit citation analysis was temporarily unavailable.");
          }
        }
      }
      const opportunities = [...(hijackResult?.opportunities ?? []), ...(listicleResult?.opportunities ?? [])];
      const visibleOpportunities = isPro ? opportunities : opportunities.map((opportunity, index) => index < 2 ? opportunity : {
        ...opportunity,
        target_url: "🔒 Upgrade to Pro to unlock hijack target",
        dead_competitor_url: "🔒 Upgrade to Pro to unlock hijack target",
        contact_email_or_link: "🔒 Upgrade to Pro to unlock hijack target",
      });
      return Response.json({
        ...report,
        citationClassifications: hijackResult?.classifications ?? [],
        hijackOpportunities: visibleOpportunities,
        hijackOpportunityCount: opportunities.length,
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
