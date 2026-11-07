import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { readRequestJson } from "@/lib/read-request-json";
import { classifyCitationForensics, compareCitationPageFacts, measureBuyerPromptCoverage } from "@/lib/citation-forensics";
import { checkRobotsAllows, fetchCitedPage, fetchCorePage } from "@/lib/entity-consistency";
import { tracePublicRedirects } from "@/lib/seo";
import { fetchSitemapUrls } from "@/lib/seo";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";

export async function POST(request: Request) {
  const { userId, orgId, orgRole } = await auth(); if (!userId) return Response.json({ error: "Sign in to inspect citation evidence." }, { status: 401 });
  const input = await readRequestJson(request, 4096); if (input.kind !== "ok" || !input.value || typeof input.value !== "object") return Response.json({ error: "Provide an audit ID." }, { status: 400 });
  const auditId = (input.value as Record<string, unknown>).auditId; if (typeof auditId !== "string") return Response.json({ error: "Provide an audit ID." }, { status: 400 });
  try {
    const db = createServerDatabase(); const access=await resolveWorkspaceAccess(db,userId,orgId??null,orgRole); const audit = await db.from("audits").select("id,domain,buyer_prompt").eq("id", auditId).in("user_id", access.ownerUserIds).maybeSingle();
    if (audit.error) throw audit.error; if (!audit.data) return Response.json({ error: "Audit not found." }, { status: 404 });
    const [page, observations, sitemapResult] = await Promise.all([fetchCorePage(audit.data.domain, "homepage"), db.from("ai_observation_evidence").select("id,prompt_query,model_name,provider,raw_answer,extracted_urls_json,observed_at").eq("audit_id", auditId).eq("domain", audit.data.domain).order("observed_at", { ascending: false }).limit(100), fetchSitemapUrls(audit.data.domain).then(urls => ({ available: true, urls }), () => ({ available: false, urls: [] as string[] }))]);
    if (observations.error) throw observations.error;
    const [result, robotsAccess] = await Promise.all([tracePublicRedirects(page.url).catch(() => null), checkRobotsAllows(page.url)]);
    const urls = new Set(sitemapResult.urls.map(value => { try { const url = new URL(value); url.hash = ""; return url.href; } catch { return value; } }));
    const sources = (observations.data ?? []).map(item => ({ observationId: item.id, promptQuery: item.prompt_query, provider: item.provider, model: item.model_name, observedAt: item.observed_at, citedUrls: item.extracted_urls_json, answer: item.raw_answer }));
    const baseHost = new URL(page.url).hostname;
    const citations = new Map<string, typeof sources>();
    for (const source of sources) for (const value of Array.isArray(source.citedUrls) ? source.citedUrls : []) {
      if (typeof value !== "string") continue;
      try {
        const url = new URL(value); url.hash = "";
        if (!["http:", "https:"].includes(url.protocol) || url.hostname === baseHost || url.hostname.endsWith(`.${baseHost}`)) continue;
        citations.set(url.href, [...(citations.get(url.href) ?? []), source]);
      } catch { /* Ignore malformed URLs; never fetch unchecked model output. */ }
    }
    const targetInSitemap = sitemapResult.available ? urls.has(new URL(page.url).href) : null;
    const comparisons = await Promise.all([...citations.entries()].slice(0, 5).map(async ([url, citedBy]) => {
      const [citedPage, citedRobots, citedTrace] = await Promise.all([fetchCitedPage(url), checkRobotsAllows(url), tracePublicRedirects(url).catch(() => null)]);
      const citedStatus = citedTrace?.status ?? (Number.isFinite(Number(citedPage.state)) ? Number(citedPage.state) : null);
      const factualDifferences = compareCitationPageFacts(page, citedPage);
      const promptFindings = citedBy.map(source => ({
        observationId: source.observationId,
        prompt: source.promptQuery,
        findings: classifyCitationForensics({ targetUrl: page.url, targetStatus: result?.status ?? null, inSitemap: targetInSitemap, robotsAllows: robotsAccess, intentSimilarity: measureBuyerPromptCoverage(source.promptQuery, page.title, page.featureClaims, page.visibleText), targetHasStructuredProof: page.jsonLd.length > 0, citedThirdPartyHasStructuredProof: citedPage.jsonLd.length > 0, citedProofStronger: citedPage.jsonLd.length > page.jsonLd.length, targetUpdatedAt: page.updatedAt, citedStatus, observedCitationUrl: url }),
      }));
      return { citedUrl: url, observedStatus: citedStatus, observedUrlState: citedStatus === 200 ? "200" : citedStatus === 404 ? "404" : citedStatus === 410 ? "410" : citedStatus === 301 ? "301" : citedPage.state, followedTo: citedTrace?.finalUrl ?? citedPage.url, citedBy: citedBy.map(source => ({ observationId: source.observationId, promptQuery: source.promptQuery, provider: source.provider, model: source.model, observedAt: source.observedAt })), citedPageEvidence: { title: citedPage.title, prices: citedPage.prices, featureClaims: citedPage.featureClaims, canonical: citedPage.canonical, updatedAt: citedPage.updatedAt, structuredDataCount: citedPage.jsonLd.length, robotsAllows: citedRobots }, factualDifferences, promptFindings };
    }));
    const findings = classifyCitationForensics({ targetUrl: page.url, targetStatus: result?.status ?? null, inSitemap: targetInSitemap, robotsAllows: robotsAccess, intentSimilarity: null, targetHasStructuredProof: page.jsonLd.length > 0, citedThirdPartyHasStructuredProof: comparisons.some(item => item.citedPageEvidence.structuredDataCount > 0), targetUpdatedAt: page.updatedAt, citedStatus: null, observedCitationUrl: null });
    return Response.json({ targetPageEvidence: { url: page.url, title: page.title, status: result?.status ?? null, inSitemap: targetInSitemap, sitemapCheckAvailable: sitemapResult.available, robotsAllows: robotsAccess, prices: page.prices, featureClaims: page.featureClaims, canonical: page.canonical, updatedAt: page.updatedAt, structuredDataCount: page.jsonLd.length, extractionStatus: page.visibleText.replace(/[^\p{L}\p{N}]/gu, "").length >= 12 ? "available" : "unknown", extractedTextLength: page.visibleText.length, extractedTextPreview: page.visibleText.slice(0, 1600) }, fixedBuyerPromptSet: [...new Set(sources.map(source => source.promptQuery))], sources, comparisons, findings, diagnosticLimits: ["Prompt coverage is an informational lexical note only; it is not semantic similarity or a model-retrieval score.", "Structured data, freshness, and factual differences are observable page properties and do not establish why an AI system selected a citation."], statement: "Observable HTTP, sitemap, timestamp, robots, page-claim, and schema evidence is shown separately from diagnostic hypotheses. CiteMend cannot inspect private model reasoning or weights." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Citation forensics are temporarily unavailable." }, { status: 503 }); }
}
