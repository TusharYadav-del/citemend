import { auth } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { readRequestJson } from "@/lib/read-request-json";
import { classifyCitationForensics } from "@/lib/citation-forensics";
import { checkRobotsAllows, fetchCorePage } from "@/lib/entity-consistency";
import { tracePublicRedirects } from "@/lib/seo";
import { fetchSitemapUrls, verifyUrl } from "@/lib/seo";

export async function POST(request: Request) {
  const { userId } = await auth(); if (!userId) return Response.json({ error: "Sign in to inspect citation evidence." }, { status: 401 });
  const input = await readRequestJson(request, 4096); if (input.kind !== "ok" || !input.value || typeof input.value !== "object") return Response.json({ error: "Provide an audit ID." }, { status: 400 });
  const auditId = (input.value as Record<string, unknown>).auditId; if (typeof auditId !== "string") return Response.json({ error: "Provide an audit ID." }, { status: 400 });
  try {
    const db = createServerDatabase(); const audit = await db.from("audits").select("id,domain,buyer_prompt").eq("id", auditId).eq("user_id", userId).maybeSingle();
    if (audit.error) throw audit.error; if (!audit.data) return Response.json({ error: "Audit not found." }, { status: 404 });
    const [page, observations, sitemap] = await Promise.all([fetchCorePage(audit.data.domain, "homepage"), db.from("ai_observation_evidence").select("id,model_name,provider,raw_answer,extracted_urls_json,observed_at").eq("audit_id", auditId).order("observed_at", { ascending: false }).limit(20), fetchSitemapUrls(audit.data.domain).catch(() => [])]);
    if (observations.error) throw observations.error;
    const [result, robotsAccess] = await Promise.all([tracePublicRedirects(page.url).catch(() => null), checkRobotsAllows(page.url)]);
    const urls = new Set(sitemap.map(value => { try { const url = new URL(value); return url.pathname; } catch { return value; } }));
    const sources = (observations.data ?? []).map(item => ({ observationId: item.id, provider: item.provider, model: item.model_name, observedAt: item.observed_at, citedUrls: item.extracted_urls_json, answer: item.raw_answer }));
    const baseHost = new URL(page.url).hostname;
    const competitorUrls = [...new Set(sources.flatMap(source => Array.isArray(source.citedUrls) ? source.citedUrls : []).filter(value => typeof value === "string" && (() => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && url.hostname !== baseHost && !url.hostname.endsWith(`.${baseHost}`); } catch { return false; } })()))].slice(0, 5);
    const comparisons = await Promise.all(competitorUrls.map(async url => {
      const parsedUrl = new URL(url);
      const [status, citedPage] = await Promise.all([verifyUrl(url).catch(() => null), fetchCorePage(parsedUrl.hostname, "homepage").catch(() => null)]);
      const finding = classifyCitationForensics({ targetUrl: page.url, targetStatus: result?.status ?? null, inSitemap: urls.has(new URL(page.url).pathname), robotsAllows: robotsAccess, intentSimilarity: null, targetHasStructuredProof: page.jsonLd.length > 0, citedThirdPartyHasStructuredProof: !!citedPage?.jsonLd.length, targetUpdatedAt: page.updatedAt, citedStatus: status?.httpStatus ?? null, observedCitationUrl: url });
      return { citedUrl: url, observedStatus: status?.httpStatus ?? null, observedUrlState: status?.state ?? "unknown", checkedSourceHomepage: citedPage?.url ?? null, sourceStructuredDataObserved: citedPage?.jsonLd.length ? citedPage.jsonLd.length > 0 : false, findings: finding };
    }));
    const findings = classifyCitationForensics({ targetUrl: page.url, targetStatus: result?.status ?? null, inSitemap: urls.has(new URL(page.url).pathname), robotsAllows: robotsAccess, intentSimilarity: null, targetHasStructuredProof: page.jsonLd.length > 0, citedThirdPartyHasStructuredProof: comparisons.some(item => item.sourceStructuredDataObserved), targetUpdatedAt: page.updatedAt, citedStatus: null, observedCitationUrl: null });
    return Response.json({ sources, comparisons, findings, diagnosticLimits: ["Semantic similarity was not measured for this run.", "Third-party structured-data checks use the source hostname homepage and do not prove why a model selected it."], statement: "Observable HTTP, sitemap, timestamp, robots, and schema evidence is shown separately from diagnostic hypotheses. CiteMend cannot inspect private model reasoning or weights." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Citation forensics are temporarily unavailable." }, { status: 503 }); }
}
