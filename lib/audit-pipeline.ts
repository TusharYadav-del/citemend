import "server-only";
import { isIP } from "node:net";
import { publicFetch } from "./public-http";
import { normalizeCitationUrl, extractTextUrls } from "./citation-urls";
import type { CitationProbeResult as GeminiProbeResult } from "./gemini";
import { runCitationProbe, type CitationProbeResult } from "./citation-probe";
type ProbeResult = CitationProbeResult | GeminiProbeResult;
import { fetchSitemapUrls, checkUrlStatus } from "./seo";
import { detectCitationGap, type CitationGap } from "./citation-gap";
import { saveAuditCitationGap } from "./citation-gap-store";
import { persistAudit } from "./audit-store";
import { matchSitemapUrls, SEMANTIC_MATCH_THRESHOLD } from "./sitemap-embeddings";

export class AuditInputError extends Error {}
export type AuditFinding = { url: string; httpStatus: number | null; error: string | null; suggestedRedirect: string | null; matchConfidence?: number };
export type AuditReport = {
  domain: string; buyerPrompt: string; buyerPrompts?: string[]; competitorDomains?: string[]; groundTruthPricing?: string; visibilityScore?: number; generatedText: string;
  groundingMetadata: GeminiProbeResult["groundingMetadata"];
  providerUsed?: string; searchGrounding?: CitationProbeResult["searchGrounding"];
  extractedUrls: string[]; sitemapUrlCount: number;
  citationGap?: CitationGap;
  findings: AuditFinding[]; warnings: string[]; status: "completed" | "partial";
};
export type AuditDependencies = {
  probe: (domain: string, buyerPrompt: string) => Promise<ProbeResult>; sitemap: typeof fetchSitemapUrls; check: typeof checkUrlStatus;
  semantic: typeof matchSitemapUrls | null;
  saveGap: typeof saveAuditCitationGap;
  resolve: (url: string) => Promise<string | null>;
  save: (report: AuditReport, userId?: string) => Promise<{ id: string; createdAt: string }>;
};

export function validateAuditInput(input: unknown): { domain: string; buyerPrompt: string; buyerPrompts?: string[]; competitorDomains?: string[]; groundTruthPricing?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AuditInputError("Expected a JSON object with domain and buyerPrompt or buyerPrompts.");
  const { domain, buyerPrompt, buyerPrompts: rawPrompts, competitorDomains: rawCompetitors, groundTruthPricing: rawPricing } = input as Record<string, unknown>;
  if (rawPricing !== undefined && (typeof rawPricing !== "string" || rawPricing.length > 8000)) throw new AuditInputError("groundTruthPricing must be text of at most 8000 characters.");
  if (typeof domain !== "string") throw new AuditInputError("domain must be a string.");
  const hostname = domain.trim().toLowerCase();
  if (hostname.length > 253 || !/^[a-z0-9.-]+$/.test(hostname) || !hostname.includes(".") || isIP(hostname) || /\.(local|localhost|internal)$/.test(hostname) || hostname.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
    throw new AuditInputError("domain must be a public hostname such as example.com, without a scheme, path, or port.");
  }
  let parsedHost: string;
  try { parsedHost = new URL(`https://${hostname}`).hostname; }
  catch { throw new AuditInputError("Enter a valid public domain, not an IP address."); }
  if (parsedHost !== hostname || isIP(parsedHost)) throw new AuditInputError("Enter a public domain, not an IP address or numeric alias.");
  let competitorDomains: string[] | undefined;
  if (rawCompetitors !== undefined) {
    if (!Array.isArray(rawCompetitors) || rawCompetitors.length > 20 || !rawCompetitors.every(value => typeof value === "string")) throw new AuditInputError("competitorDomains must contain up to 20 domain names.");
    competitorDomains = [...new Set(rawCompetitors.map(value => (value as string).trim().toLowerCase()))];
    for (const competitor of competitorDomains) {
      if (competitor.length > 253 || !/^[a-z0-9.-]+$/.test(competitor) || !competitor.includes(".") || isIP(competitor) || /\.(local|localhost|internal)$/.test(competitor) || competitor.split(".").some(label => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) throw new AuditInputError("Each competitorDomains entry must be a public hostname such as competitor.com.");
      try { if (new URL(`https://${competitor}`).hostname !== competitor) throw new Error(); }
      catch { throw new AuditInputError("Each competitorDomains entry must be a public hostname such as competitor.com."); }
    }
    competitorDomains = competitorDomains.filter(candidate => candidate !== hostname);
  }
  let prompts: string[];
  if (rawPrompts !== undefined) {
    if (!Array.isArray(rawPrompts) || rawPrompts.length < 1 || rawPrompts.length > 5 || !rawPrompts.every((value) => typeof value === "string")) throw new AuditInputError("buyerPrompts must contain 1 to 5 prompt strings.");
    prompts = rawPrompts.map((value) => (value as string).trim());
    if (prompts.some((value) => !value || value.length > 4000)) throw new AuditInputError("Each buyer prompt must contain 1 to 4000 characters.");
    if (typeof buyerPrompt === "string" && buyerPrompt.trim() && buyerPrompt.trim() !== prompts[0]) throw new AuditInputError("When both fields are provided, buyerPrompt must match the first buyerPrompts entry.");
  } else {
    if (typeof buyerPrompt !== "string" || !buyerPrompt.trim() || buyerPrompt.length > 4000) throw new AuditInputError("buyerPrompt must contain 1 to 4000 characters.");
    prompts = [buyerPrompt.trim()];
  }
  return { domain: hostname, buyerPrompt: prompts[0], ...(rawPrompts !== undefined ? { buyerPrompts: prompts } : {}), ...(competitorDomains !== undefined ? { competitorDomains } : {}), ...(typeof rawPricing === "string" && rawPricing.trim() ? { groundTruthPricing: rawPricing.trim() } : {}) };
}

const normalizedUrl = normalizeCitationUrl;
function inDomain(url: string, domain: string): boolean {
  const host = new URL(url).hostname;
  return host === domain || host.endsWith(`.${domain}`);
}
function isGroundingRedirect(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === "https:" && parsed.hostname === "vertexaisearch.cloud.google.com" && parsed.pathname.startsWith("/grounding-api-redirect/");
}

/** Extracts URLs from text and all string values in grounding metadata. */
export function extractCitationUrls(probe: ProbeResult): string[] {
  const found = new Set(extractTextUrls(probe.text));
  function visit(value: unknown): void {
    if (typeof value === "string") {
      const direct = /\s/.test(value.trim()) ? null : normalizedUrl(value.trim());
      if (direct) found.add(direct);
      else extractTextUrls(value).forEach((url) => found.add(url));
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  }
  if ("citedUrls" in probe) visit(probe.citedUrls);
  else { visit(probe.groundingMetadata); visit(probe.sources); }
  return [...found];
}

/** Resolve Google's citation wrappers without fetching their final destination here. */
async function resolveGroundingRedirect(value: string): Promise<string | null> {
  let url = value;
  const signal = AbortSignal.timeout(10_000);
  for (let hop = 0; hop < 5; hop++) {
    if (!isGroundingRedirect(url)) return url;
    let response = await publicFetch(url, { method: "HEAD", redirect: "manual", cache: "no-store", signal });
    if ([403, 405, 501].includes(response.status)) {
      await response.body?.cancel();
      response = await publicFetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal });
    }
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) return null;
    const next = normalizedUrl(new URL(location, url).href);
    if (!next) return null;
    url = next;
  }
  return isGroundingRedirect(url) ? null : url;
}

async function mapLimited<T, R>(values: T[], fn: (value: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(5, values.length) }, async () => {
    while (cursor < values.length) { const index = cursor++; output[index] = await fn(values[index]); }
  }));
  return output;
}
function pathTokens(value: string): Set<string> {
  const path = new URL(value).pathname.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  return new Set(path.split(/[^a-z0-9]+/).filter(Boolean));
}
function similarity(a: string, b: string): number {
  function dice(left: Set<string>, right: Set<string>) {
    const overlap = [...left].filter((part) => right.has(part)).length;
    return left.size + right.size ? 2 * overlap / (left.size + right.size) : 0;
  }
  function bigrams(url: string) {
    const path = new URL(url).pathname.toLowerCase();
    return new Set(Array.from({ length: Math.max(0, path.length - 1) }, (_, index) => path.slice(index, index + 2)));
  }
  return 0.4 * dice(pathTokens(a), pathTokens(b)) + 0.6 * dice(bigrams(a), bigrams(b));
}

export async function runAudit(input: unknown, overrides: Partial<AuditDependencies> = {}, userId?: string) {
  const { domain, buyerPrompt, buyerPrompts = [buyerPrompt], competitorDomains: providedCompetitors, groundTruthPricing } = validateAuditInput(input);
  const deps: AuditDependencies = { probe: runCitationProbe, sitemap: fetchSitemapUrls, check: checkUrlStatus, resolve: resolveGroundingRedirect, save: persistAudit, saveGap: saveAuditCitationGap, semantic: process.env.GEMINI_API_KEY ? matchSitemapUrls : null, ...overrides };
  const [sitemapResults, probeResults] = await Promise.all([
    Promise.allSettled([deps.sitemap(domain)]),
    Promise.allSettled(buyerPrompts.map((prompt) => deps.probe(domain, prompt))),
  ]);
  const sitemapResult = sitemapResults[0];
  const successfulProbes = probeResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const probeFailures = probeResults.flatMap((result, index) => result.status === "rejected" ? [`Buyer prompt ${index + 1} probe failed.`] : []);
  if (!successfulProbes.length) {
    const failure = probeResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw failure?.reason ?? new AuditInputError("All buyer prompt probes failed.");
  }
  const allProbeUrls = [...new Set(successfulProbes.flatMap(extractCitationUrls))];
  const firstProbe = successfulProbes[0];
  const probe: ProbeResult = "searchGrounding" in firstProbe
    ? {
      text: successfulProbes.map((item, index) => `Buyer intent ${index + 1}: ${buyerPrompts[index]}\n${item.text}`).join("\n\n"),
      citedUrls: allProbeUrls,
      providerUsed: [...new Set(successfulProbes.map((item) => "providerUsed" in item ? item.providerUsed : "gemini"))].join(", "),
      searchGrounding: {
        status: successfulProbes.some((item) => "searchGrounding" in item && item.searchGrounding.status === "available") ? "available" : successfulProbes.some((item) => "searchGrounding" in item && item.searchGrounding.status === "unavailable") ? "unavailable" : "not_configured",
        sources: [...new Map(successfulProbes.flatMap((item) => "searchGrounding" in item ? item.searchGrounding.sources : []).map((source) => [source.url, source])).values()].slice(0, 40),
      },
      warnings: [...new Set([...successfulProbes.flatMap((item) => "warnings" in item ? item.warnings : []), ...probeFailures])],
    }
    : {
      text: successfulProbes.map((item, index) => `Buyer intent ${index + 1}: ${buyerPrompts[index]}\n${item.text}`).join("\n\n"),
      groundingMetadata: "groundingMetadata" in firstProbe ? firstProbe.groundingMetadata : null,
      sources: [...new Map([...successfulProbes.flatMap((item) => "sources" in item ? item.sources : []).map((source) => [source.url, source] as const), ...allProbeUrls.map((url, index) => [url, { index: index + 100, url, title: url }] as const)]).values()].slice(0, 140),
      citations: successfulProbes.flatMap((item) => "citations" in item ? item.citations : []),
    };
  const extracted = extractCitationUrls(probe);
  if (extracted.length > 100) throw new AuditInputError("The generated response contains more than 100 citation URLs; narrow the buyer prompt.");
  const warnings: string[] = [...("warnings" in probe ? probe.warnings : []), ...probeFailures];
  const resolved = await mapLimited(extracted.filter(isGroundingRedirect), async (url) => {
    try { const result = await deps.resolve(url); if (result) return normalizedUrl(result); } catch {}
    warnings.push("A Google grounding citation could not be resolved.");
    return null;
  });
  const allUrls = [...new Set([...extracted, ...resolved.filter((url): url is string => !!url)])];
  const competitorDomains = providedCompetitors ?? (await import("./hijacker")).inferCompetitorDomains(domain, allUrls, probe.text);
  const targetUrls = allUrls.filter((url) => inDomain(url, domain));
  if (targetUrls.length > 50) throw new AuditInputError("More than 50 target-domain citations were found; narrow the buyer prompt.");
  let sitemap: string[] = [];
  if (sitemapResult.status === "fulfilled") sitemap = [...new Set(sitemapResult.value.map(normalizedUrl).filter((url): url is string => !!url && inDomain(url, domain)))];
  else warnings.push("Sitemap discovery failed; redirect suggestions may be unavailable.");
  const statusCache = new Map<string, Promise<number | null>>();
  let checkDeadline = Date.now() + 30_000;
  function status(url: string) {
    if (!statusCache.has(url)) statusCache.set(url, Date.now() >= checkDeadline ? Promise.resolve(null) : deps.check(url).catch(() => null));
    return statusCache.get(url)!;
  }
  const findings: AuditFinding[] = await mapLimited(targetUrls, async (url) => {
    const httpStatus = await status(url);
    return { url, httpStatus, error: httpStatus === null ? "HTTP status check failed or timed out." : null, suggestedRedirect: null };
  });
  const broken = findings.filter(item => item.httpStatus === 404);
  let semanticMatches = new Map<string, { url: string; similarity: number }[]>();
  if (broken.length && sitemap.length && deps.semantic) {
    try { semanticMatches = await deps.semantic(domain, broken.map(item => item.url), sitemap); }
    catch { warnings.push("Semantic matching was unavailable; redirect suggestions use URL spelling similarity without a confidence score."); }
    // Provider/storage work must not consume the live destination-check budget.
    checkDeadline = Date.now() + 30_000;
  }
  // Semantic candidates are suggestions only until a live 2xx response is verified.
  for (const finding of broken) {
    for (const candidate of semanticMatches.get(finding.url) ?? []) {
      const url = normalizedUrl(candidate.url);
      if (!url || !sitemap.includes(url) || new URL(url).hostname !== new URL(finding.url).hostname
        || new URL(url).pathname === new URL(finding.url).pathname || !Number.isFinite(candidate.similarity)
        || candidate.similarity < SEMANTIC_MATCH_THRESHOLD || candidate.similarity > 1) continue;
      const code = await status(url);
      if (code !== null && code >= 200 && code < 300) {
        finding.suggestedRedirect = url;
        finding.matchConfidence = Math.round(candidate.similarity * 100);
        break;
      }
    }
  }
  // Preserve lexical matching when semantic search is unavailable or inconclusive.
  for (const finding of broken.filter(item => !item.suggestedRedirect)) {
    const ranked = sitemap.filter((url) => url !== finding.url)
      .map((url) => ({ url, score: similarity(finding.url, url) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, 5);
    for (const candidate of ranked) {
      const code = await status(candidate.url);
      if (code === null) warnings.push("A redirect candidate could not be verified within the checking budget.");
      if (code !== null && code >= 200 && code < 300) { finding.suggestedRedirect = candidate.url; break; }
    }
  }
  if (findings.some((item) => item.error)) warnings.push("Some citation statuses are unknown; these are not classified as 404s.");
  const groundingMetadata = "groundingMetadata" in probe ? probe.groundingMetadata : null;
  if (!("searchGrounding" in probe) && !groundingMetadata) warnings.push("The probe returned no grounding metadata; only response text URLs could be inspected.");
  const verifiedFindings = findings.filter((finding) => finding.httpStatus !== null);
  const visibilityScore = verifiedFindings.length ? Math.round(100 * verifiedFindings.filter((finding) => finding.httpStatus! >= 200 && finding.httpStatus! < 300).length / verifiedFindings.length) : 0;
  const report: AuditReport = { domain, buyerPrompt, ...(buyerPrompts.length > 1 ? { buyerPrompts } : {}), competitorDomains, ...(groundTruthPricing ? { groundTruthPricing } : {}), visibilityScore, generatedText: probe.text, groundingMetadata, providerUsed: "providerUsed" in probe ? probe.providerUsed : "gemini", ...("searchGrounding" in probe ? { searchGrounding: probe.searchGrounding } : {}), extractedUrls: allUrls, sitemapUrlCount: sitemap.length, findings, warnings: [...new Set(warnings)], status: warnings.length ? "partial" : "completed" };
  const gap = detectCitationGap(domain, buyerPrompt, probe.text, report.providerUsed ?? "unknown");
  if (gap) report.citationGap = gap;
  if (process.env.AUDIT_PERSISTENCE_MODE === "local") {
    report.status = "partial";
    report.warnings.push("Local report only: database persistence is disabled.");
    return { ...report, auditId: null, createdAt: new Date().toISOString(), persistence: { status: "disabled" as const }, suggestionCandidatesPer404: 5 };
  }
  try {
    const saved = await deps.save(report, userId);
    if (gap && userId) {
      try { await deps.saveGap(saved.id, userId, domain, gap); }
      catch { report.status = "partial"; report.warnings.push("The audit was saved, but citation-gap evidence could not be saved. Apply migration 010 to enable saved capsule actions."); }
    }
    return { ...report, auditId: saved.id, createdAt: saved.createdAt, persistence: { status: "saved" as const }, suggestionCandidatesPer404: 5 };
  } catch {
    report.status = "partial";
    report.warnings.push("Database save could not be verified. This report is available here but is not confirmed in audit history.");
    return { ...report, auditId: null, createdAt: new Date().toISOString(), persistence: { status: "failed" as const }, suggestionCandidatesPer404: 5 };
  }
}
